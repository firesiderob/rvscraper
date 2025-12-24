// backend/src/routes/leads.js
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const auth = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Get all leads with filtering and sorting
router.get('/', auth, async (req, res) => {
    try {
        const { state, type, status, search, sortBy = 'createdAt', order = 'desc' } = req.query;

        const filter = {};
        if (state) filter.state = state;
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { city: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const leads = await Lead.find(filter)
            .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
            .limit(1000); // Limit for performance

        res.json({ leads, count: leads.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all good leads (must be before /:id route)
router.get('/good', auth, async (req, res) => {
    try {
        const leads = await Lead.find({ isGoodLead: true })
            .sort({ markedGoodAt: -1 });

        res.json({ leads, count: leads.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single lead
router.get('/:id', auth, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new lead
router.post('/', auth, async (req, res) => {
    try {
        const lead = new Lead(req.body);
        await lead.save();
        res.status(201).json(lead);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update lead
router.patch('/:id', auth, async (req, res) => {
    try {
        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json(lead);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete lead
router.delete('/:id', auth, async (req, res) => {
    try {
        const lead = await Lead.findByIdAndDelete(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get RVTI Certified Technicians
router.get('/rvti-techs', auth, async (req, res) => {
    try {
        const { franchise, state, search } = req.query;

        const filter = {
            source: 'RVTI',
            type: 'RV Tech'
        };

        if (state) filter.state = state;
        if (franchise) filter['rvtiData.nearestFranchise'] = { $regex: franchise, $options: 'i' };
        if (search) {
            filter.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { city: { $regex: search, $options: 'i' } },
                { 'rvtiData.nearestFranchise': { $regex: search, $options: 'i' } }
            ];
        }

        const techs = await Lead.find(filter)
            .sort({ 'rvtiData.distanceToFranchise': 1 })
            .limit(500);

        // Get unique franchises for filter dropdown
        const franchises = await Lead.distinct('rvtiData.nearestFranchise', { source: 'RVTI' });

        res.json({
            techs,
            count: techs.length,
            franchises: franchises.filter(f => f).sort()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get stats
router.get('/stats/summary', auth, async (req, res) => {
    try {
        const total = await Lead.countDocuments();
        const byStatus = await Lead.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const byType = await Lead.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        const byState = await Lead.aggregate([
            { $group: { _id: '$state', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({ total, byStatus, byType, topStates: byState });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle Do Not Call flag
router.patch('/:id/toggle-dnc', auth, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Toggle DNC flag
        const newDncStatus = !lead.compliance.doNotCall;
        lead.compliance.doNotCall = newDncStatus;
        lead.compliance.dncCheckedAt = new Date();
        lead.compliance.dncSource = 'manual';

        await lead.save();
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark lead as good for Facebook export
router.patch('/:id/mark-good', auth, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        lead.isGoodLead = !lead.isGoodLead;
        lead.markedGoodAt = lead.isGoodLead ? new Date() : null;
        await lead.save();

        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enrich a single lead with AI
router.post('/:id/enrich', auth, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        if (!lead.website) {
            return res.status(400).json({ error: 'Lead has no website to research' });
        }

        // Fetch website content
        const urls = [
            lead.website,
            lead.website.replace(/\/$/, '') + '/about',
            lead.website.replace(/\/$/, '') + '/about-us',
            lead.website.replace(/\/$/, '') + '/contact'
        ];

        let websiteText = '';
        for (const url of urls) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                clearTimeout(timeout);

                if (response.ok) {
                    const html = await response.text();
                    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .substring(0, 5000);
                    websiteText += ' ' + text;
                }
            } catch (e) {
                // Ignore fetch errors
            }
        }

        if (websiteText.length < 100) {
            return res.status(400).json({ error: 'Could not fetch website content' });
        }

        // Use Claude to extract owner info
        const aiResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: `Analyze this text from "${lead.businessName}" website (${lead.state}).

Extract:
1. Owner/Founder name (first and last)
2. Personal email (not generic like info@ or contact@)
3. LinkedIn URL if mentioned

Website text:
${websiteText.substring(0, 4000)}

Respond in JSON only:
{
  "ownerFirstName": "string or null",
  "ownerLastName": "string or null",
  "personalEmail": "string or null",
  "linkedinUrl": "string or null",
  "confidence": "high/medium/low"
}`
            }]
        });

        const content = aiResponse.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const enrichedData = JSON.parse(jsonMatch[0]);
            enrichedData.enrichedAt = new Date();

            lead.enrichedData = enrichedData;

            // Also update ownerName if found
            if (enrichedData.ownerFirstName) {
                lead.ownerName = [enrichedData.ownerFirstName, enrichedData.ownerLastName].filter(Boolean).join(' ');
            }

            await lead.save();

            // Build summary of what was found
            const found = [];
            const notFound = [];

            if (enrichedData.ownerFirstName) {
                found.push('Owner Name');
            } else {
                notFound.push('Owner Name');
            }

            if (enrichedData.personalEmail) {
                found.push('Email');
            } else {
                notFound.push('Email');
            }

            if (enrichedData.linkedinUrl) {
                found.push('LinkedIn');
            } else {
                notFound.push('LinkedIn');
            }

            res.json({
                success: true,
                lead,
                enrichedData,
                summary: {
                    found,
                    notFound,
                    message: found.length > 0
                        ? `Found: ${found.join(', ')}${notFound.length > 0 ? `. Not found: ${notFound.join(', ')}` : ''}`
                        : `No contact information found on website`
                }
            });
        } else {
            res.status(400).json({ error: 'Could not parse AI response' });
        }
    } catch (error) {
        console.error('Enrichment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk enrich leads
router.post('/enrich-bulk', auth, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'Invalid lead IDs' });
        }

        // Process in background, return immediately
        res.json({ success: true, message: `Enriching ${ids.length} leads in background` });

        // Process each lead (don't await, let it run in background)
        for (const id of ids) {
            try {
                const lead = await Lead.findById(id);
                if (lead && lead.website && !lead.enrichedData?.enrichedAt) {
                    // Make request to self to enrich (simplified approach)
                    // In production, use a job queue
                    const enrichUrl = `http://localhost:${process.env.PORT || 5001}/api/leads/${id}/enrich`;
                    fetch(enrichUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': req.headers.authorization,
                            'Content-Type': 'application/json'
                        }
                    }).catch(() => {});

                    // Rate limit
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (e) {
                console.error('Bulk enrich error for', id, e.message);
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export good leads as Facebook CSV
router.get('/export/facebook', auth, async (req, res) => {
    try {
        const leads = await Lead.find({ isGoodLead: true });

        const header = 'email,phone,city,state,zip,country,fn,ln';
        const rows = [header];

        const junkPatterns = ['sentry-next.wixpress', 'webador.com', 'noreply@', 'no-reply@'];

        for (const lead of leads) {
            // Get best email
            let email = lead.enrichedData?.personalEmail || lead.email || '';
            if (junkPatterns.some(p => email.toLowerCase().includes(p))) {
                email = '';
            }

            // Clean phone
            let phone = (lead.phone || '').replace(/[^0-9]/g, '');
            if (phone.length === 10) phone = '1' + phone;

            // Get name
            const firstName = lead.enrichedData?.ownerFirstName || lead.ownerName?.split(' ')[0] || '';
            const lastName = lead.enrichedData?.ownerLastName || lead.ownerName?.split(' ').slice(1).join(' ') || '';

            if (email || phone) {
                const row = [
                    email,
                    phone,
                    lead.city || '',
                    lead.state || '',
                    lead.zip || '',
                    'US',
                    firstName,
                    lastName
                ].map(f => '"' + (f || '').replace(/"/g, '""') + '"').join(',');

                rows.push(row);
            }
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=good_leads_facebook.csv');
        res.send(rows.join('\n'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
