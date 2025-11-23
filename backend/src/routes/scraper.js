// backend/src/routes/scraper.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const uhaulScraper = require('../scrapers/uhaulScraper');
const rvTechScraper = require('../scrapers/rvTechScraper');
const googleMapsScraper = require('../scrapers/googleMapsScraper');
const rvtraderScraper = require('../scrapers/rvtraderScraper');
const craigslistScraper = require('../scrapers/craigslistScraper');

// Google Maps Search Agent
router.post('/search', auth, async (req, res) => {
    try {
        const { query, limit = 20 } = req.body;
        const leads = await googleMapsScraper.searchGoogleMaps(query, limit);
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape U-Haul locations for a specific state
router.post('/uhaul/:state', auth, async (req, res) => {
    try {
        const { state } = req.params;
        const { limit = 50 } = req.body;

        const leads = await uhaulScraper.scrapeUHaulLocations(state.toUpperCase(), limit);
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape RV techs for a specific state
router.post('/rvtech/:state', auth, async (req, res) => {
    try {
        const { state } = req.params;
        const { city = '', limit = 50 } = req.body;

        const leads = await rvTechScraper.scrapeRVTechs(state.toUpperCase(), city, limit);
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape all states (U-Haul)
router.post('/uhaul/all', auth, async (req, res) => {
    try {
        const { limit = 10 } = req.body;

        // Start scraping in background
        res.json({ success: true, message: 'Scraping started. This may take a while.' });

        // Run in background
        uhaulScraper.scrapeAllStates(limit).then(results => {
            console.log('U-Haul scraping completed:', results.length, 'states processed');
        }).catch(error => {
            console.error('U-Haul scraping error:', error);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape all states (RV Tech)
router.post('/rvtech/all', auth, async (req, res) => {
    try {
        const { limit = 10 } = req.body;

        // Start scraping in background
        res.json({ success: true, message: 'Scraping started. This may take a while.' });

        // Run in background
        rvTechScraper.scrapeAllStates(limit).then(results => {
            console.log('RV Tech scraping completed:', results.length, 'states processed');
        }).catch(error => {
            console.error('RV Tech scraping error:', error);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape RVTrader for RV owners (private sellers)
// Debug endpoint for RVTrader scraper – returns raw HTML snippet and link count
router.get('/rvowners/rvtrader/debug', auth, async (req, res) => {
    try {
        const { state = 'FL', city = '', rvType = '' } = req.query;
        // Build URL (same logic as scraper)
        let baseUrl = `https://www.rvtrader.com/search-results?state=${state.toUpperCase()}`;
        if (city) baseUrl += `&city=${encodeURIComponent(city)}`;
        if (rvType) baseUrl += `&type=${encodeURIComponent(rvType)}`;
        let searchUrl = `${baseUrl}&sellerType=private`;
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        // Initial navigation
        try {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 120000 });
        } catch (e) {
            console.warn('Debug initial navigation failed:', e.message);
        }

        let linkCount = await page.$$eval('a[href*="/rv/"]', els => els.length);

        if (linkCount === 0) {
            searchUrl = baseUrl;
            try {
                await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 120000 });
            } catch (e) {
                console.warn('Debug fallback navigation failed:', e.message);
            }
            linkCount = await page.$$eval('a[href*="/rv/"]', els => els.length);
        }
        // Get all hrefs
        const allHrefs = await page.$$eval('a', els => els.map(e => e.href).filter(h => h).slice(0, 100));

        await browser.close();
        res.json({ success: true, searchUrl, linkCount, allHrefs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Scrape RVTrader for RV owners (private sellers)
router.post('/rvowners/rvtrader', auth, async (req, res) => {
    try {
        const { state, city = '', rvType = '', limit = 50 } = req.body;

        if (!state) {
            return res.status(400).json({ error: 'State is required' });
        }

        const leads = await rvtraderScraper.scrapeRVTrader(state.toUpperCase(), city, rvType, limit);
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scrape Craigslist for RV owners
router.post('/rvowners/craigslist', auth, async (req, res) => {
    try {
        const { city, state, limit = 50 } = req.body;
        console.log(`\n🔍 Craigslist scrape request: City=${city}, State=${state}, Limit=${limit}`);

        if (!city || !state) {
            console.log('❌ Missing city or state');
            return res.status(400).json({ error: 'City and state are required' });
        }

        console.log('✅ Starting Craigslist scraper...');
        const leads = await craigslistScraper.scrapeCraigslist(city, state.toUpperCase(), limit);
        console.log(`✅ Craigslist scrape complete: ${leads.length} leads saved`);
        res.json({ success: true, count: leads.length, leads });
    } catch (error) {
        console.error('❌ Craigslist scrape error:', error.message);
        res.status(500).json({ error: error.message });
    }
})

    ;

// Data Axle RV owner search
router.post('/rvowners/dataaxle', auth, async (req, res) => {
    try {
        const { state, city, zipCode, limit = 100 } = req.body;
        console.log(`\n🔍 Data Axle search request: State=${state}, City=${city}, Limit=${limit}`);

        if (!state) {
            console.log('❌ Missing state');
            return res.status(400).json({ error: 'State is required' });
        }

        const dataAxleService = require('../services/dataAxleService');

        // Search for RV owners
        const results = await dataAxleService.searchRVOwners({ state, city, zipCode, limit });

        // Save to database
        const Lead = require('../models/Lead');
        const savedLeads = [];

        for (const result of results) {
            try {
                // Check for duplicates
                const existing = await Lead.findOne({
                    $or: [
                        { dataAxleId: result.dataAxleId },
                        { phone: result.phone, state: result.state }
                    ]
                });

                if (!existing) {
                    const lead = new Lead(result);
                    await lead.save();
                    savedLeads.push(lead);
                }
            } catch (saveError) {
                console.error('Error saving Data Axle lead:', saveError.message);
            }
        }

        console.log(`✅ Data Axle search complete: ${savedLeads.length} new leads saved (${results.length} total returned)`);
        res.json({
            success: true,
            count: savedLeads.length,
            totalReturned: results.length,
            leads: savedLeads,
            mockMode: results[0]?.source?.includes('MOCK') || false
        });
    } catch (error) {
        console.error('❌ Data Axle search error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get Data Axle account info
router.get('/dataaxle/account', auth, async (req, res) => {
    try {
        const dataAxleService = require('../services/dataAxleService');
        const accountInfo = await dataAxleService.getAccountInfo();
        res.json(accountInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
