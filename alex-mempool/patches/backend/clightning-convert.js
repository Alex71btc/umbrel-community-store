"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertAndmergeBidirectionalChannels = exports.convertNode = exports.FeaturesMap = exports.FeatureBits = void 0;
const funding_tx_fetcher_1 = __importDefault(require("../../../tasks/lightning/sync-tasks/funding-tx-fetcher"));
const logger_1 = __importDefault(require("../../../logger"));
const common_1 = require("../../common");
const format_1 = require("../../../utils/format");
const config_1 = __importDefault(require("../../../config"));
// https://github.com/lightningnetwork/lnd/blob/master/lnwire/features.go
var FeatureBits;
(function (FeatureBits) {
    FeatureBits[FeatureBits["DataLossProtectRequired"] = 0] = "DataLossProtectRequired";
    FeatureBits[FeatureBits["DataLossProtectOptional"] = 1] = "DataLossProtectOptional";
    FeatureBits[FeatureBits["InitialRoutingSync"] = 3] = "InitialRoutingSync";
    FeatureBits[FeatureBits["UpfrontShutdownScriptRequired"] = 4] = "UpfrontShutdownScriptRequired";
    FeatureBits[FeatureBits["UpfrontShutdownScriptOptional"] = 5] = "UpfrontShutdownScriptOptional";
    FeatureBits[FeatureBits["GossipQueriesRequired"] = 6] = "GossipQueriesRequired";
    FeatureBits[FeatureBits["GossipQueriesOptional"] = 7] = "GossipQueriesOptional";
    FeatureBits[FeatureBits["TLVOnionPayloadRequired"] = 8] = "TLVOnionPayloadRequired";
    FeatureBits[FeatureBits["TLVOnionPayloadOptional"] = 9] = "TLVOnionPayloadOptional";
    FeatureBits[FeatureBits["StaticRemoteKeyRequired"] = 12] = "StaticRemoteKeyRequired";
    FeatureBits[FeatureBits["StaticRemoteKeyOptional"] = 13] = "StaticRemoteKeyOptional";
    FeatureBits[FeatureBits["PaymentAddrRequired"] = 14] = "PaymentAddrRequired";
    FeatureBits[FeatureBits["PaymentAddrOptional"] = 15] = "PaymentAddrOptional";
    FeatureBits[FeatureBits["MPPRequired"] = 16] = "MPPRequired";
    FeatureBits[FeatureBits["MPPOptional"] = 17] = "MPPOptional";
    FeatureBits[FeatureBits["WumboChannelsRequired"] = 18] = "WumboChannelsRequired";
    FeatureBits[FeatureBits["WumboChannelsOptional"] = 19] = "WumboChannelsOptional";
    FeatureBits[FeatureBits["AnchorsRequired"] = 20] = "AnchorsRequired";
    FeatureBits[FeatureBits["AnchorsOptional"] = 21] = "AnchorsOptional";
    FeatureBits[FeatureBits["AnchorsZeroFeeHtlcTxRequired"] = 22] = "AnchorsZeroFeeHtlcTxRequired";
    FeatureBits[FeatureBits["AnchorsZeroFeeHtlcTxOptional"] = 23] = "AnchorsZeroFeeHtlcTxOptional";
    FeatureBits[FeatureBits["ShutdownAnySegwitRequired"] = 26] = "ShutdownAnySegwitRequired";
    FeatureBits[FeatureBits["ShutdownAnySegwitOptional"] = 27] = "ShutdownAnySegwitOptional";
    FeatureBits[FeatureBits["AMPRequired"] = 30] = "AMPRequired";
    FeatureBits[FeatureBits["AMPOptional"] = 31] = "AMPOptional";
    FeatureBits[FeatureBits["ExplicitChannelTypeRequired"] = 44] = "ExplicitChannelTypeRequired";
    FeatureBits[FeatureBits["ExplicitChannelTypeOptional"] = 45] = "ExplicitChannelTypeOptional";
    FeatureBits[FeatureBits["ScidAliasRequired"] = 46] = "ScidAliasRequired";
    FeatureBits[FeatureBits["ScidAliasOptional"] = 47] = "ScidAliasOptional";
    FeatureBits[FeatureBits["PaymentMetadataRequired"] = 48] = "PaymentMetadataRequired";
    FeatureBits[FeatureBits["PaymentMetadataOptional"] = 49] = "PaymentMetadataOptional";
    FeatureBits[FeatureBits["ZeroConfRequired"] = 50] = "ZeroConfRequired";
    FeatureBits[FeatureBits["ZeroConfOptional"] = 51] = "ZeroConfOptional";
    FeatureBits[FeatureBits["KeysendRequired"] = 54] = "KeysendRequired";
    FeatureBits[FeatureBits["KeysendOptional"] = 55] = "KeysendOptional";
    FeatureBits[FeatureBits["ScriptEnforcedLeaseRequired"] = 2022] = "ScriptEnforcedLeaseRequired";
    FeatureBits[FeatureBits["ScriptEnforcedLeaseOptional"] = 2023] = "ScriptEnforcedLeaseOptional";
    FeatureBits[FeatureBits["SimpleTaprootChannelsRequiredFinal"] = 80] = "SimpleTaprootChannelsRequiredFinal";
    FeatureBits[FeatureBits["SimpleTaprootChannelsOptionalFinal"] = 81] = "SimpleTaprootChannelsOptionalFinal";
    FeatureBits[FeatureBits["SimpleTaprootChannelsRequiredStaging"] = 180] = "SimpleTaprootChannelsRequiredStaging";
    FeatureBits[FeatureBits["SimpleTaprootChannelsOptionalStaging"] = 181] = "SimpleTaprootChannelsOptionalStaging";
    FeatureBits[FeatureBits["MaxBolt11Feature"] = 5114] = "MaxBolt11Feature";
})(FeatureBits = exports.FeatureBits || (exports.FeatureBits = {}));
;
exports.FeaturesMap = new Map([
    [FeatureBits.DataLossProtectRequired, 'data-loss-protect'],
    [FeatureBits.DataLossProtectOptional, 'data-loss-protect'],
    [FeatureBits.InitialRoutingSync, 'initial-routing-sync'],
    [FeatureBits.UpfrontShutdownScriptRequired, 'upfront-shutdown-script'],
    [FeatureBits.UpfrontShutdownScriptOptional, 'upfront-shutdown-script'],
    [FeatureBits.GossipQueriesRequired, 'gossip-queries'],
    [FeatureBits.GossipQueriesOptional, 'gossip-queries'],
    [FeatureBits.TLVOnionPayloadRequired, 'tlv-onion'],
    [FeatureBits.TLVOnionPayloadOptional, 'tlv-onion'],
    [FeatureBits.StaticRemoteKeyOptional, 'static-remote-key'],
    [FeatureBits.StaticRemoteKeyRequired, 'static-remote-key'],
    [FeatureBits.PaymentAddrOptional, 'payment-addr'],
    [FeatureBits.PaymentAddrRequired, 'payment-addr'],
    [FeatureBits.MPPOptional, 'multi-path-payments'],
    [FeatureBits.MPPRequired, 'multi-path-payments'],
    [FeatureBits.AnchorsRequired, 'anchor-commitments'],
    [FeatureBits.AnchorsOptional, 'anchor-commitments'],
    [FeatureBits.AnchorsZeroFeeHtlcTxRequired, 'anchors-zero-fee-htlc-tx'],
    [FeatureBits.AnchorsZeroFeeHtlcTxOptional, 'anchors-zero-fee-htlc-tx'],
    [FeatureBits.WumboChannelsRequired, 'wumbo-channels'],
    [FeatureBits.WumboChannelsOptional, 'wumbo-channels'],
    [FeatureBits.AMPRequired, 'amp'],
    [FeatureBits.AMPOptional, 'amp'],
    [FeatureBits.PaymentMetadataOptional, 'payment-metadata'],
    [FeatureBits.PaymentMetadataRequired, 'payment-metadata'],
    [FeatureBits.ExplicitChannelTypeOptional, 'explicit-commitment-type'],
    [FeatureBits.ExplicitChannelTypeRequired, 'explicit-commitment-type'],
    [FeatureBits.KeysendOptional, 'keysend'],
    [FeatureBits.KeysendRequired, 'keysend'],
    [FeatureBits.ScriptEnforcedLeaseRequired, 'script-enforced-lease'],
    [FeatureBits.ScriptEnforcedLeaseOptional, 'script-enforced-lease'],
    [FeatureBits.ScidAliasRequired, 'scid-alias'],
    [FeatureBits.ScidAliasOptional, 'scid-alias'],
    [FeatureBits.ZeroConfRequired, 'zero-conf'],
    [FeatureBits.ZeroConfOptional, 'zero-conf'],
    [FeatureBits.ShutdownAnySegwitRequired, 'shutdown-any-segwit'],
    [FeatureBits.ShutdownAnySegwitOptional, 'shutdown-any-segwit'],
    [FeatureBits.SimpleTaprootChannelsRequiredFinal, 'taproot-channels'],
    [FeatureBits.SimpleTaprootChannelsOptionalFinal, 'taproot-channels'],
    [FeatureBits.SimpleTaprootChannelsRequiredStaging, 'taproot-channels-staging'],
    [FeatureBits.SimpleTaprootChannelsOptionalStaging, 'taproot-channels-staging'],
]);
/**
 * Convert a clightning "listnode" entry to a lnd node entry
 */
function convertNode(clNode) {
    let custom_records = undefined;
    if (clNode.option_will_fund) {
        try {
            custom_records = { '1': Buffer.from(clNode.option_will_fund.compact_lease || '', 'hex').toString('base64') };
        }
        catch (e) {
            logger_1.default.err(`Cannot decode option_will_fund compact_lease for ${clNode.nodeid}). Reason: ` + (e instanceof Error ? e.message : e));
            custom_records = undefined;
        }
    }
    const nodeFeatures = [];
    const nodeFeaturesBinary = (0, format_1.hex2bin)(clNode.features).split('').reverse().join('');
    for (let i = 0; i < nodeFeaturesBinary.length; i++) {
        if (nodeFeaturesBinary[i] === '0') {
            continue;
        }
        const feature = exports.FeaturesMap.get(i);
        if (!feature) {
            nodeFeatures.push({
                bit: i,
                name: 'unknown',
                is_required: i % 2 === 0,
                is_known: false
            });
        }
        else {
            nodeFeatures.push({
                bit: i,
                name: feature,
                is_required: i % 2 === 0,
                is_known: true
            });
        }
    }
    return {
        alias: clNode.alias ?? '',
        color: `#${clNode.color ?? ''}`,
        features: nodeFeatures,
        pub_key: clNode.nodeid,
        addresses: clNode.addresses?.map((addr) => {
            let address = addr.address;
            if (addr.type === 'ipv6') {
                address = `[${address}]`;
            }
            return {
                network: addr.type,
                addr: `${address}:${addr.port}`
            };
        }) ?? [],
        last_update: clNode?.last_timestamp ?? 0,
        custom_records
    };
}
exports.convertNode = convertNode;
/**
 * Convert clightning "listchannels" response to lnd "describegraph.edges" format
 */
async function convertAndmergeBidirectionalChannels(clChannels) {
    logger_1.default.debug(`Converting clightning nodes and channels to lnd graph format`, logger_1.default.tags.ln);
    let loggerTimer = new Date().getTime() / 1000;
    let channelProcessed = 0;
    const consolidatedChannelList = [];
    const clChannelsDict = {};
    const clChannelsDictCount = {};
    for (const clChannel of clChannels) {
        if (!clChannelsDict[clChannel.short_channel_id]) {
            clChannelsDict[clChannel.short_channel_id] = clChannel;
            clChannelsDictCount[clChannel.short_channel_id] = 1;
        }
        else {
            const fullChannel = await buildFullChannel(clChannel, clChannelsDict[clChannel.short_channel_id]);
            if (fullChannel !== null) {
                consolidatedChannelList.push(fullChannel);
                delete clChannelsDict[clChannel.short_channel_id];
                clChannelsDictCount[clChannel.short_channel_id]++;
            }
        }
        const elapsedSeconds = Math.round((new Date().getTime() / 1000) - loggerTimer);
        if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
            logger_1.default.info(`Building complete channels from clightning output. Channels processed: ${channelProcessed + 1} of ${clChannels.length}`, logger_1.default.tags.ln);
            loggerTimer = new Date().getTime() / 1000;
        }
        ++channelProcessed;
    }
    channelProcessed = 0;
    const keys = Object.keys(clChannelsDict);
    for (const short_channel_id of keys) {
        const incompleteChannel = await buildIncompleteChannel(clChannelsDict[short_channel_id]);
        if (incompleteChannel !== null) {
            consolidatedChannelList.push(incompleteChannel);
        }
        const elapsedSeconds = Math.round((new Date().getTime() / 1000) - loggerTimer);
        if (elapsedSeconds > config_1.default.LIGHTNING.LOGGER_UPDATE_INTERVAL) {
            logger_1.default.info(`Building partial channels from clightning output. Channels processed: ${channelProcessed + 1} of ${keys.length}`);
            loggerTimer = new Date().getTime() / 1000;
        }
        channelProcessed++;
    }
    return consolidatedChannelList;
}
exports.convertAndmergeBidirectionalChannels = convertAndmergeBidirectionalChannels;
/**
 * Convert two clightning "getchannels" entries into a full a lnd "describegraph.edges" format
 * In this case, clightning knows the channel policy for both nodes
 */
async function buildFullChannel(clChannelA, clChannelB) {
    if (!clChannelA || !clChannelA.short_channel_id) { return null; }
    const lastUpdate = Math.max(clChannelA.last_update ?? 0, clChannelB.last_update ?? 0);



    const tx = await funding_tx_fetcher_1.default.$fetchChannelOpenTx(clChannelA.short_channel_id);
    if (!tx) {
        return null;
    }
    if (!clChannelA.short_channel_id) { return null; }
    const parts = clChannelA.short_channel_id.split('x');
    const outputIdx = parts[2];
    return {
        channel_id: common_1.Common.channelShortIdToIntegerId(clChannelA.short_channel_id),
        capacity: (clChannelA.amount_msat / 1000).toString(),
        last_update: lastUpdate,
        node1_policy: convertPolicy(clChannelA),
        node2_policy: convertPolicy(clChannelB),
        chan_point: `${tx.txid}:${outputIdx}`,
        node1_pub: clChannelA.source,
        node2_pub: clChannelB.source,
    };
}
/**
 * Convert one clightning "getchannels" entry into a full a lnd "describegraph.edges" format
 * In this case, clightning knows the channel policy of only one node
 */
async function buildIncompleteChannel(clChannel) {
    if (!clChannel || !clChannel.short_channel_id) { return null; }



    const tx = await funding_tx_fetcher_1.default.$fetchChannelOpenTx(clChannel.short_channel_id);
    if (!tx) {
        return null;
    }
    if (!clChannel.short_channel_id) { return null; }
    const parts = clChannel.short_channel_id.split('x');
    const outputIdx = parts[2];
    return {
        channel_id: common_1.Common.channelShortIdToIntegerId(clChannel.short_channel_id),
        capacity: (clChannel.amount_msat / 1000).toString(),
        last_update: clChannel.last_update ?? 0,
        node1_policy: convertPolicy(clChannel),
        node2_policy: null,
        chan_point: `${tx.txid}:${outputIdx}`,
        node1_pub: clChannel.source,
        node2_pub: clChannel.destination,
    };
}
/**
 * Convert a clightning "listnode" response to a lnd channel policy format
 */
function convertPolicy(clChannel) {
    return {
        time_lock_delta: clChannel.delay,
        min_htlc: clChannel.htlc_minimum_msat.toString(),
        max_htlc_msat: clChannel.htlc_maximum_msat.toString(),
        fee_base_msat: clChannel.base_fee_millisatoshi,
        fee_rate_milli_msat: clChannel.fee_per_millionth,
        disabled: !clChannel.active,
        last_update: clChannel.last_update ?? 0,
    };
}
