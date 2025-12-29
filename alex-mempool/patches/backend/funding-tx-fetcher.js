"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const bitcoin_client_1 = __importDefault(require("../../../api/bitcoin/bitcoin-client"));
const common_1 = require("../../../api/common");
const config_1 = __importDefault(require("../../../config"));
const logger_1 = __importDefault(require("../../../logger"));
const fsPromises = fs_1.promises;
const BLOCKS_CACHE_MAX_SIZE = 100;
const CACHE_FILE_NAME = config_1.default.MEMPOOL.CACHE_DIR + '/ln-funding-txs-cache.json';
class FundingTxFetcher {
    running = false;
    blocksCache = {};
    channelNewlyProcessed = 0;
    fundingTxCache = {};
    async $init() {
        // Load funding tx disk cache
        if (Object.keys(this.fundingTxCache).length === 0 && (0, fs_1.existsSync)(CACHE_FILE_NAME)) {
            try {
                this.fundingTxCache = JSON.parse(await fsPromises.readFile(CACHE_FILE_NAME, 'utf-8'));
            }
            catch (e) {
                logger_1.default.err(`Unable to parse channels funding txs disk cache. Starting from scratch`, logger_1.default.tags.ln);
                this.fundingTxCache = {};
            }
            logger_1.default.debug(`Imported ${Object.keys(this.fundingTxCache).length} funding tx amount from the disk cache`, logger_1.default.tags.ln);
        }
    }
    async $fetchChannelsFundingTxs(channelIds) {
        if (this.running) {
            return;
        }
        this.running = true;
        const globalTimer = new Date().getTime() / 1000;
        let cacheTimer = new Date().getTime() / 1000;
        let loggerTimer = new Date().getTime() / 1000;
        let channelProcessed = 0;
        this.channelNewlyProcessed = 0;
        for (const channelId of channelIds) {
            await this.$fetchChannelOpenTx(channelId);
            ++channelProcessed;
            let elapsedSeconds = Math.round((new Date().getTime() / 1000) - loggerTimer);
            if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
                elapsedSeconds = Math.round((new Date().getTime() / 1000) - globalTimer);
                logger_1.default.info(`Indexing channels funding tx ${channelProcessed + 1} of ${channelIds.length} ` +
                    `(${Math.floor(channelProcessed / channelIds.length * 10000) / 100}%) | ` +
                    `elapsed: ${elapsedSeconds} seconds`, logger_1.default.tags.ln);
                loggerTimer = new Date().getTime() / 1000;
            }
            elapsedSeconds = Math.round((new Date().getTime() / 1000) - cacheTimer);
            if (elapsedSeconds > 60) {
                logger_1.default.debug(`Saving ${Object.keys(this.fundingTxCache).length} funding txs cache into disk`, logger_1.default.tags.ln);
                fsPromises.writeFile(CACHE_FILE_NAME, JSON.stringify(this.fundingTxCache));
                cacheTimer = new Date().getTime() / 1000;
            }
        }
        if (this.channelNewlyProcessed > 0) {
            logger_1.default.info(`Indexed ${this.channelNewlyProcessed} additional channels funding tx`, logger_1.default.tags.ln);
            logger_1.default.debug(`Saving ${Object.keys(this.fundingTxCache).length} funding txs cache into disk`, logger_1.default.tags.ln);
            fsPromises.writeFile(CACHE_FILE_NAME, JSON.stringify(this.fundingTxCache));
        }
        this.running = false;
    }
    async $fetchChannelOpenTx(channelId) {
        channelId = common_1.Common.channelIntegerIdToShortId(channelId);
        if (!channelId || typeof channelId !== "string" || channelId.indexOf("x") === -1) {
            return null;
        }
        if (this.fundingTxCache[channelId]) {
            return this.fundingTxCache[channelId];
        }
        const parts = channelId.split('x');
        const blockHeight = parts[0];
        const txIdx = parts[1];
        const outputIdx = parts[2];
        let block = this.blocksCache[blockHeight];
        // Fetch it from core
        if (!block) {
            const blockHash = await bitcoin_client_1.default.getBlockHash(parseInt(blockHeight, 10));
            block = await bitcoin_client_1.default.getBlock(blockHash, 1);
        }
        this.blocksCache[block.height] = block;
        const blocksCacheHashes = Object.keys(this.blocksCache).sort((a, b) => parseInt(b) - parseInt(a)).reverse();
        if (blocksCacheHashes.length > BLOCKS_CACHE_MAX_SIZE) {
            for (let i = 0; i < 10; ++i) {
                delete this.blocksCache[blocksCacheHashes[i]];
            }
        }
        const txid = block.tx[txIdx];
        const rawTx = await bitcoin_client_1.default.getRawTransaction(txid);
        const tx = await bitcoin_client_1.default.decodeRawTransaction(rawTx);
        if (!tx || !tx.vout || tx.vout.length < parseInt(outputIdx, 10) + 1 || tx.vout[outputIdx].value === undefined) {
            logger_1.default.err(`Cannot find blockchain funding tx for channel id ${channelId}. Possible reasons are: bitcoin backend timeout or the channel shortId is not valid`);
            return null;
        }
        this.fundingTxCache[channelId] = {
            timestamp: block.time,
            txid: txid,
            value: tx.vout[outputIdx].value,
        };
        ++this.channelNewlyProcessed;
        return this.fundingTxCache[channelId];
    }
}
exports.default = new FundingTxFetcher;
