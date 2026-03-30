#!/usr/bin/env node
/**
 * M3U8 to iptvchannels.js converter (Node.js version)
 *
 * Parses M3U8 playlist files and generates JavaScript array format
 * for use in pwa-player's iptvchannels.js.
 *
 * Usage:
 *     node m3u8_to_channels.js input.m3u8 output.js
 *     node m3u8_to_channels.js input.m3u8 --stdout
 *     node m3u8_to_channels.js input.m3u8 --group-by-name
 *     node m3u8_to_channels.js input.m3u8 --unique-url
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse #EXTINF line to extract channel name and metadata.
 * Format: #EXTINF:-1 tvg-name="..." tvg-logo="..." group-title="..." ...,ChannelName
 */
function parseExtInf(line) {
    if (!line.startsWith('#EXTINF:')) return null;

    const content = line.slice(8).trim();
    const commaPos = content.lastIndexOf(',');
    if (commaPos === -1) return null;

    const attrsPart = content.slice(0, commaPos);
    const name = content.slice(commaPos + 1).trim();

    const metadata = {};

    const tvgNameMatch = attrsPart.match(/tvg-name="([^"]*)"/);
    if (tvgNameMatch) metadata.tvg_name = tvgNameMatch[1];

    const tvgLogoMatch = attrsPart.match(/tvg-logo="([^"]*)"/);
    if (tvgLogoMatch) metadata.tvg_logo = tvgLogoMatch[1];

    const groupMatch = attrsPart.match(/group-title="([^"]*)"/);
    if (groupMatch) metadata.group = groupMatch[1];

    return { name, metadata };
}

/**
 * Normalize channel name for grouping.
 * Removes common variations like hyphens, spaces, suffixes.
 */
function normalizeChannelName(name) {
    let normalized = name;

    // Remove common suffixes like "-HD", "HD", "-4K", "4K"
    normalized = normalized.replace(/[-\s]?HD$/i, '');
    normalized = normalized.replace(/[-\s]?4K$/i, '');

    // Normalize hyphens and spaces
    normalized = normalized.replace(/[-\s]/g, '');

    // Upper case for consistency
    normalized = normalized.toUpperCase();

    return normalized;
}

/**
 * Parse M3U8 content and return list of channel objects.
 */
function parseM3u8(content, options = {}) {
    const { groupByName = true, uniqueUrls = false, includeLogo = false, includeGroup = false } = options;

    const lines = content.trim().split('\n');
    const channelGroups = {};
    const channels = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXTINF:')) {
            const parsed = parseExtInf(line);
            if (parsed) {
                const { name, metadata } = parsed;

                // Look for URL on next line
                i++;
                if (i < lines.length) {
                    const url = lines[i].trim();
                    if (url && !url.startsWith('#')) {
                        if (groupByName) {
                            const normName = normalizeChannelName(name);
                            if (!channelGroups[normName]) {
                                channelGroups[normName] = {
                                    originalNames: [name],
                                    urls: [],
                                    metadata
                                };
                            } else {
                                if (!channelGroups[normName].originalNames.includes(name)) {
                                    channelGroups[normName].originalNames.push(name);
                                }
                            }

                            if (uniqueUrls) {
                                if (!channelGroups[normName].urls.includes(url)) {
                                    channelGroups[normName].urls.push(url);
                                }
                            } else {
                                channelGroups[normName].urls.push(url);
                            }
                        } else {
                            channels.push({ name, url });
                        }
                    }
                }
            }
        }
    }

    if (groupByName) {
        const result = [];
        const sortedKeys = Object.keys(channelGroups).sort();

        for (const normName of sortedKeys) {
            const group = channelGroups[normName];
            const urls = group.urls;

            // Choose best original name (prefer one with proper formatting)
            let bestName = group.originalNames[0];
            for (const n of group.originalNames) {
                if (n.includes('-') && n.includes('CCTV')) {
                    bestName = n;
                    break;
                }
            }

            const channel = { name: bestName };

            if (urls.length === 1) {
                channel.url = urls[0];
            } else {
                channel.urls = urls;
            }

            // Add metadata if available
            if (includeLogo && group.metadata.tvg_logo) channel.logo = group.metadata.tvg_logo;
            if (includeGroup && group.metadata.group) channel.group = group.metadata.group;

            result.push(channel);
        }

        return result;
    }

    return channels;
}

/**
 * Generate JavaScript output for iptvchannels.js format.
 */
function generateJsOutput(channels) {
    const lines = ['// Generated from M3U8 file', 'export const iptvChannels = ['];

    for (const channel of channels) {
        const json = JSON.stringify(channel, null, 2);
        const indented = json.split('\n').map(line => '  ' + line).join('\n');
        lines.push(indented + ',');
    }

    lines.push('];');
    return lines.join('\n');
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node m3u8_to_channels.js <input.m3u8> [output.js]');
        console.error('Options:');
        console.error('  --stdout        Print output to stdout');
        console.error('  --no-group      Don\'t group URLs, output each EXTINF separately');
        console.error('  --unique-url    Remove duplicate URLs within each channel');
        console.error('  --logo          Include logo field in output');
        console.error('  --group-field   Include group field in output');
        console.error('  --limit N       Limit number of channels output');
        console.error('  --filter-group  Only include channels from specified group-title');
        process.exit(1);
    }

    const inputFile = args[0];
    const outputFile = args.find(a => !a.startsWith('--') && a !== inputFile);
    const stdout = args.includes('--stdout');
    const noGroup = args.includes('--no-group');
    const uniqueUrl = args.includes('--unique-url');
    const includeLogo = args.includes('--logo');
    const includeGroupField = args.includes('--group-field');

    const limitArg = args.find(a => a.startsWith('--limit'));
    const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1], 10) : null;

    const filterGroupArg = args.find(a => a.startsWith('--filter-group'));
    const filterGroup = filterGroupArg
        ? (filterGroupArg.includes('=') ? filterGroupArg.split('=')[1] : args[args.indexOf(filterGroupArg) + 1])
        : null;

    // Read input file
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file '${inputFile}' not found`);
        process.exit(1);
    }

    const content = fs.readFileSync(inputFile, 'utf-8');

    // Parse M3U8
    let channels = parseM3u8(content, {
        groupByName: !noGroup,
        uniqueUrls: uniqueUrl,
        includeLogo: includeLogo,
        includeGroup: includeGroupField
    });

    // Filter by group if specified
    if (filterGroup) {
        channels = channels.filter(c => c.group === filterGroup);
    }

    // Limit if specified
    if (limit) {
        channels = channels.slice(0, limit);
    }

    // Generate output
    const output = generateJsOutput(channels);

    // Write or print output
    if (stdout || !outputFile) {
        process.stdout.write(output);
    } else {
        fs.writeFileSync(outputFile, output, 'utf-8');
        console.log(`Written ${channels.length} channels to ${outputFile}`);
    }
}

main();