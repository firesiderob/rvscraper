// backend/src/routes/leads.js
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const auth = require('../middleware/auth');

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

module.exports = router;
