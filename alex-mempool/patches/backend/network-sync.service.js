"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../../database"));
const logger_1 = __importDefault(require("../../logger"));
const channels_api_1 = __importDefault(require("../../api/explorer/channels.api"));
const bitcoin_api_factory_1 = __importDefault(require("../../api/bitcoin/bitcoin-api-factory"));
const config_1 = __importDefault(require("../../config"));
const node_locations_1 = require("./sync-tasks/node-locations");
const lightning_api_factory_1 = __importDefault(require("../../api/lightning/lightning-api-factory"));
const nodes_api_1 = __importDefault(require("../../api/explorer/nodes.api"));
const funding_tx_fetcher_1 = __importDefault(require("./sync-tasks/funding-tx-fetcher"));
const NodesSocketsRepository_1 = __importDefault(require("../../repositories/NodesSocketsRepository"));
const common_1 = require("../../api/common");
const blocks_1 = __importDefault(require("../../api/blocks"));
const NodeRecordsRepository_1 = __importDefault(require("../../repositories/NodeRecordsRepository"));
const forensics_service_1 = __importDefault(require("./forensics.service"));
class NetworkSyncService {
    loggerTimer = 0;
    closedChannelsScanBlock = 0;
    constructor() { }
    async $startService() {
        logger_1.default.info(`Starting lightning network sync service`, logger_1.default.tags.ln);
        this.loggerTimer = new Date().getTime() / 1000;
        await this.$runTasks();
    }
    async $runTasks() {
        const taskStartTime = Date.now();
        try {
            logger_1.default.debug(`Updating nodes and channels`, logger_1.default.tags.ln);
            const networkGraph = await lightning_api_factory_1.default.$getNetworkGraph();
            if (networkGraph.nodes.length === 0 || networkGraph.edges.length === 0) {
                logger_1.default.info(`LN Network graph is empty, retrying in 10 seconds`, logger_1.default.tags.ln);
                setTimeout(() => { this.$runTasks(); }, 10000);
                return;
            }
            await this.$updateNodesList(networkGraph.nodes);
            await this.$updateChannelsList(networkGraph.edges);
            await this.$deactivateChannelsWithoutActiveNodes();
            await this.$lookUpCreationDateFromChain();
            await this.$updateNodeFirstSeen();
            await this.$scanForClosedChannels();
            if (config_1.default.MEMPOOL.BACKEND === 'esplora') {
                // run forensics on new channels only
                await forensics_service_1.default.$runClosedChannelsForensics(true);
            }
        }
        catch (e) {
            logger_1.default.err(`$runTasks() error: ${e instanceof Error ? (e.stack || e.message) : e}`, logger_1.default.tags.ln);
        }
        setTimeout(() => { this.$runTasks(); }, Math.max(1, (1000 * config_1.default.LIGHTNING.GRAPH_REFRESH_INTERVAL) - (Date.now() - taskStartTime)));
    }
    /**
     * Update the `nodes` table to reflect the current network graph state
     */
    async $updateNodesList(nodes) {
        let progress = 0;
        let deletedSockets = 0;
        let deletedRecords = 0;
        const graphNodesPubkeys = [];
        for (const node of nodes) {
            const latestUpdated = await channels_api_1.default.$getLatestChannelUpdateForNode(node.pub_key);
            node.last_update = Math.max(node.last_update ?? 0, latestUpdated);
            await nodes_api_1.default.$saveNode(node);
            graphNodesPubkeys.push(node.pub_key);
            ++progress;
            const elapsedSeconds = Math.round((new Date().getTime() / 1000) - this.loggerTimer);
            if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                logger_1.default.debug(`Updating node ${progress}/${nodes.length}`, logger_1.default.tags.ln);
                this.loggerTimer = new Date().getTime() / 1000;
            }
            const addresses = [];
            for (const socket of node.addresses) {
                await NodesSocketsRepository_1.default.$saveSocket(common_1.Common.formatSocket(node.pub_key, socket));
                addresses.push(socket.addr);
            }
            deletedSockets += await NodesSocketsRepository_1.default.$deleteUnusedSockets(node.pub_key, addresses);
            const oldRecordTypes = await NodeRecordsRepository_1.default.$getRecordTypes(node.pub_key);
            const customRecordTypes = [];
            for (const [type, payload] of Object.entries(node.custom_records || {})) {
                const numericalType = parseInt(type);
                await NodeRecordsRepository_1.default.$saveRecord({
                    publicKey: node.pub_key,
                    type: numericalType,
                    payload,
                });
                customRecordTypes.push(numericalType);
            }
            if (oldRecordTypes.reduce((changed, type) => changed || customRecordTypes.indexOf(type) === -1, false)) {
                deletedRecords += await NodeRecordsRepository_1.default.$deleteUnusedRecords(node.pub_key, customRecordTypes);
            }
        }
        logger_1.default.debug(`${progress} nodes updated. ${deletedSockets} sockets deleted. ${deletedRecords} custom records deleted.`);
        // If a channel if not present in the graph, mark it as inactive
        await nodes_api_1.default.$setNodesInactive(graphNodesPubkeys);
        if (config_1.default.MAXMIND.ENABLED) {
            (0, node_locations_1.$lookupNodeLocation)();
        }
    }
    /**
     * Update the `channels` table to reflect the current network graph state
     */
    async $updateChannelsList(channels) {
        try {
            const [closedChannelsRaw] = await database_1.default.query(`SELECT id FROM channels WHERE status = 2`);
            const closedChannels = {};
            for (const closedChannel of closedChannelsRaw) {
                closedChannels[closedChannel.id] = true;
            }
            let progress = 0;
            const graphChannelsIds = [];
            for (const channel of channels) {
                if (!closedChannels[channel.channel_id]) {
                    await channels_api_1.default.$saveChannel(channel);
                }
                graphChannelsIds.push(channel.channel_id);
                ++progress;
                const elapsedSeconds = Math.round((new Date().getTime() / 1000) - this.loggerTimer);
                if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                    logger_1.default.debug(`Updating channel ${progress}/${channels.length}`, logger_1.default.tags.ln);
                    this.loggerTimer = new Date().getTime() / 1000;
                }
            }
            logger_1.default.debug(`${progress} channels updated`, logger_1.default.tags.ln);
            // If a channel if not present in the graph, mark it as inactive
            await channels_api_1.default.$setChannelsInactive(graphChannelsIds);
        }
        catch (e) {
            logger_1.default.err(` Cannot update channel list. Reason: ${(e instanceof Error ? (e.stack || e.message) : e)}`, logger_1.default.tags.ln);
        }
    }
    // This method look up the creation date of the earliest channel of the node
    // and update the node to that date in order to get the earliest first seen date
    async $updateNodeFirstSeen() {
        let progress = 0;
        let updated = 0;
        try {
            const [nodes] = await database_1.default.query(`
        SELECT nodes.public_key, UNIX_TIMESTAMP(nodes.first_seen) AS first_seen,
        (
          SELECT MIN(UNIX_TIMESTAMP(created))
          FROM channels
          WHERE channels.node1_public_key = nodes.public_key
        ) AS created1,
        (
          SELECT MIN(UNIX_TIMESTAMP(created))
          FROM channels
          WHERE channels.node2_public_key = nodes.public_key
        ) AS created2
        FROM nodes
      `);
            for (const node of nodes) {
                const lowest = Math.min(node.created1 ?? Number.MAX_SAFE_INTEGER, node.created2 ?? Number.MAX_SAFE_INTEGER, node.first_seen ?? Number.MAX_SAFE_INTEGER);
                if (lowest < node.first_seen) {
                    const query = `UPDATE nodes SET first_seen = FROM_UNIXTIME(?) WHERE public_key = ?`;
                    const params = [lowest, node.public_key];
                    ++updated;
                    await database_1.default.query(query, params);
                }
                ++progress;
                const elapsedSeconds = Math.round((new Date().getTime() / 1000) - this.loggerTimer);
                if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                    logger_1.default.debug(`Updating node first seen date ${progress}/${nodes.length}`, logger_1.default.tags.ln);
                    this.loggerTimer = new Date().getTime() / 1000;
                }
            }
            if (updated > 0) {
                logger_1.default.debug(`Updated ${updated} node first seen dates`, logger_1.default.tags.ln);
            }
        }
        catch (e) {
            logger_1.default.err(`$updateNodeFirstSeen() error: ${e instanceof Error ? (e.stack || e.message) : e}`, logger_1.default.tags.ln);
        }
    }
    async $lookUpCreationDateFromChain() {
        let progress = 0;
        logger_1.default.debug(`Running channel creation date lookup`, logger_1.default.tags.ln);
        try {
            const channels = await channels_api_1.default.$getChannelsWithoutCreatedDate();
            for (const channel of channels) {
                const transaction = await funding_tx_fetcher_1.default.$fetchChannelOpenTx(channel.short_id);
                if (!transaction) {
                    continue;
                }
                await database_1.default.query(`
          UPDATE channels SET created = FROM_UNIXTIME(?) WHERE channels.id = ?`, [transaction.timestamp, channel.id]);
                ++progress;
                const elapsedSeconds = Math.round((new Date().getTime() / 1000) - this.loggerTimer);
                if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                    logger_1.default.debug(`Updating channel creation date ${progress}/${channels.length}`, logger_1.default.tags.ln);
                    this.loggerTimer = new Date().getTime() / 1000;
                }
            }
            if (channels.length > 0) {
                logger_1.default.debug(`Updated ${channels.length} channels' creation date`, logger_1.default.tags.ln);
            }
        }
        catch (e) {
            logger_1.default.err(`$lookUpCreationDateFromChain() error: ${e instanceof Error ? (e.stack || e.message) : e}`, logger_1.default.tags.ln);
        }
    }
    /**
     * If a channel does not have any active node linked to it, then also
     * mark that channel as inactive
     */
    async $deactivateChannelsWithoutActiveNodes() {
        logger_1.default.debug(`Find channels which nodes are offline`, logger_1.default.tags.ln);
        try {
            const result = await database_1.default.query(`
        UPDATE channels
        SET status = 0
        WHERE channels.status = 1
        AND (
          (
            SELECT COUNT(*)
            FROM nodes
            WHERE nodes.public_key = channels.node1_public_key
            AND nodes.status = 1
          ) = 0
        OR (
            SELECT COUNT(*)
            FROM nodes
            WHERE nodes.public_key = channels.node2_public_key
            AND nodes.status = 1
          ) = 0)
        `);
            if (result[0].changedRows ?? 0 > 0) {
                logger_1.default.debug(`Marked ${result[0].changedRows} channels as inactive because they are not linked to any active node`, logger_1.default.tags.ln);
            }
        }
        catch (e) {
            logger_1.default.err(`$deactivateChannelsWithoutActiveNodes() error: ${e instanceof Error ? (e.stack || e.message) : e}`, logger_1.default.tags.ln);
        }
    }
    async $scanForClosedChannels() {
        let currentBlockHeight = blocks_1.default.getCurrentBlockHeight();
        if (config_1.default.MEMPOOL.ENABLED === false) { // https://github.com/mempool/mempool/issues/3582
            currentBlockHeight = await bitcoin_api_factory_1.default.$getBlockHeightTip();
        }
        if (this.closedChannelsScanBlock === currentBlockHeight) {
            logger_1.default.debug(`We've already scan closed channels for this block, skipping.`);
            return;
        }
        let progress = 0;
        try {
            let log = `Starting closed channels scan`;
            if (this.closedChannelsScanBlock > 0) {
                log += `. Last scan was at block ${this.closedChannelsScanBlock}`;
            }
            else {
                log += ` for the first time`;
            }
            logger_1.default.debug(`${log}`, logger_1.default.tags.ln);
            const allChannels = await channels_api_1.default.$getChannelsByStatus([0, 1]);
            const sliceLength = Math.ceil(config_1.default.ESPLORA.BATCH_QUERY_BASE_SIZE / 2);
            // process batches of 5000 channels
            for (let i = 0; i < Math.ceil(allChannels.length / sliceLength); i++) {
                const channels = allChannels.slice(i * sliceLength, (i + 1) * sliceLength);
                const outspends = await bitcoin_api_factory_1.default.$getOutSpendsByOutpoint(channels.map(channel => {
                    return { txid: channel.transaction_id, vout: channel.transaction_vout };
                }));
                for (const [index, channel] of channels.entries()) {
                    const spendingTx = outspends[index];
                    if (spendingTx.spent === true && spendingTx.status?.confirmed === true) {
                        // logger.debug(`Marking channel: ${channel.id} as closed.`, logger.tags.ln);
                        await database_1.default.query(`UPDATE channels SET status = 2, closing_date = FROM_UNIXTIME(?) WHERE id = ?`, [spendingTx.status.block_time, channel.id]);
                        if (spendingTx.txid && !channel.closing_transaction_id) {
                            await database_1.default.query(`UPDATE channels SET closing_transaction_id = ? WHERE id = ?`, [spendingTx.txid, channel.id]);
                        }
                    }
                }
                progress += channels.length;
                const elapsedSeconds = Math.round((new Date().getTime() / 1000) - this.loggerTimer);
                if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                    logger_1.default.debug(`Checking if channel has been closed ${progress}/${allChannels.length}`, logger_1.default.tags.ln);
                    this.loggerTimer = new Date().getTime() / 1000;
                }
            }
            this.closedChannelsScanBlock = currentBlockHeight;
            logger_1.default.debug(`Closed channels scan completed at block ${this.closedChannelsScanBlock}`, logger_1.default.tags.ln);
        }
        catch (e) {
            logger_1.default.err(`$scanForClosedChannels() error: ${e instanceof Error ? (e.stack || e.message) : e}`, logger_1.default.tags.ln);
        }
    }
}
exports.default = new NetworkSyncService();
