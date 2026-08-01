const axios = require('axios');
const fs = require('fs');
const { performance } = require('perf_hooks');

const BASE_URL = 'https://nuvio-live-sports.onrender.com';
const LIVE_CATALOG = `${BASE_URL}/catalog/tv/nuvio_sports_live.json`;

async function validateLiveStreams() {
    console.log("Starting Live Validation...");
    const report = {
        performance: {},
        dataAccuracy: {
            totalEvents: 0,
            duplicates: [],
            missingMetadata: []
        },
        streamValidation: {
            totalStreamsChecked: 0,
            noStreams: [],
            deadStreams: [],
            duplicateStreams: [],
            incorrectStreams: []
        }
    };

    // 1. Fetch Catalog (Performance + Data Accuracy)
    console.log(`Fetching catalog: ${LIVE_CATALOG}`);
    const startCatalog = performance.now();
    let catalog = [];
    try {
        const catRes = await axios.get(LIVE_CATALOG);
        const endCatalog = performance.now();
        report.performance.catalogLoadTimeMs = Math.round(endCatalog - startCatalog);
        catalog = catRes.data.metas || [];
    } catch (e) {
        console.error("Failed to load catalog", e.message);
        return;
    }

    report.dataAccuracy.totalEvents = catalog.length;

    // Check Data Accuracy
    const seenIds = new Set();
    const seenNames = new Set();
    for (const item of catalog) {
        if (seenIds.has(item.id)) {
            report.dataAccuracy.duplicates.push(`Duplicate ID: ${item.id}`);
        }
        if (seenNames.has(item.name)) {
            report.dataAccuracy.duplicates.push(`Duplicate Name: ${item.name} (${item.id})`);
        }
        seenIds.add(item.id);
        seenNames.add(item.name);

        if (!item.name || !item.poster || !item.description) {
            report.dataAccuracy.missingMetadata.push(`Item ${item.id} missing name/poster/desc`);
        }
    }

    console.log(`Found ${catalog.length} live events.`);

    // 2. Fetch Streams (Stream Validation + Performance)
    let totalStreamLoadTime = 0;
    
    // To avoid overloading the server, let's limit how many we check, or process them in sequence
    const maxToCheck = Math.min(catalog.length, 20); // check first 20 for speed, or all if we have time
    
    for (let i = 0; i < maxToCheck; i++) {
        const item = catalog[i];
        const streamUrl = `${BASE_URL}/stream/tv/${encodeURIComponent(item.id)}.json`;
        console.log(`Checking streams for ${item.id}...`);
        
        const startStream = performance.now();
        let streams = [];
        try {
            const streamRes = await axios.get(streamUrl);
            streams = streamRes.data.streams || [];
            totalStreamLoadTime += (performance.now() - startStream);
        } catch (e) {
            console.error(`Failed to load streams for ${item.id}`, e.message);
            report.streamValidation.noStreams.push(item.id);
            continue;
        }

        if (streams.length === 0) {
            report.streamValidation.noStreams.push(item.id);
            continue;
        }

        const seenUrls = new Set();
        for (const stream of streams) {
            report.streamValidation.totalStreamsChecked++;
            const url = stream.url || stream.ytId;
            if (!url) {
                report.streamValidation.incorrectStreams.push(`Stream without URL for ${item.id}`);
                continue;
            }
            if (seenUrls.has(url)) {
                report.streamValidation.duplicateStreams.push(`Duplicate URL ${url} in ${item.id}`);
            }
            seenUrls.add(url);

            // Ping the stream URL to check if it's dead
            if (stream.url && stream.url.startsWith('http')) {
                try {
                    // Just HEAD or GET a small chunk
                    await axios.get(stream.url, { timeout: 5000, headers: { Range: 'bytes=0-100' } });
                } catch (e) {
                    if (e.response && (e.response.status === 403 || e.response.status === 401)) {
                        // Some streams might be geo-blocked or require specific headers, note but not strictly dead
                        report.streamValidation.incorrectStreams.push(`Auth/Geo error for ${url} (status: ${e.response.status})`);
                    } else {
                        report.streamValidation.deadStreams.push(`Dead link ${url} (Error: ${e.message})`);
                    }
                }
            }
        }
    }

    report.performance.averageStreamLoadTimeMs = Math.round(totalStreamLoadTime / maxToCheck);

    fs.writeFileSync('validation_report.json', JSON.stringify(report, null, 2));
    console.log("Validation complete! Report saved to validation_report.json");
}

validateLiveStreams();
