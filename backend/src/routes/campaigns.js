// backend/src/routes/campaigns.js
const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const auth = require('../middleware/auth');
const emailService = require('../services/emailService');

// Get all campaigns
router.get('/', auth, async (req, res) => {
    try {
        const campaigns = await Campaign.find()
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });
        res.json({ campaigns });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single campaign
router.get('/:id', auth, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id)
            .populate('recipients')
            .populate('createdBy', 'name email');

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new campaign
router.post('/', auth, async (req, res) => {
    try {
        const { name, subject, emailTemplate, recipientFilter } = req.body;

        // Find recipients based on filter
        const filter = {};
        if (recipientFilter.state) filter.state = recipientFilter.state;
        if (recipientFilter.type) filter.type = recipientFilter.type;
        if (recipientFilter.status) filter.status = recipientFilter.status;

        // Only include leads with email addresses
        filter.email = { $exists: true, $ne: null, $ne: '' };

        const recipients = await Lead.find(filter).select('_id');

        const campaign = new Campaign({
            name,
            subject,
            emailTemplate,
            recipients: recipients.map(r => r._id),
            createdBy: req.user._id
        });

        await campaign.save();
        res.status(201).json(campaign);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Send campaign
router.post('/:id/send', auth, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id)
            .populate('recipients');

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        if (campaign.status === 'Sent') {
            return res.status(400).json({ error: 'Campaign already sent' });
        }

        // Update campaign status
        campaign.status = 'Sending';
        await campaign.save();

        // Send emails in background
        res.json({ success: true, message: 'Campaign sending started' });

        // Get recipients with email addresses
        const recipientsWithEmail = campaign.recipients.filter(r => r.email);

        emailService.sendCampaign(
            recipientsWithEmail,
            campaign.subject,
            campaign.emailTemplate
        ).then(results => {
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;

            campaign.status = 'Sent';
            campaign.sentCount = successCount;
            campaign.failedCount = failedCount;
            campaign.sentAt = new Date();
            campaign.save();

            console.log(`Campaign ${campaign.name} sent: ${successCount} success, ${failedCount} failed`);
        }).catch(error => {
            campaign.status = 'Failed';
            campaign.save();
            console.error('Campaign sending error:', error);
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete campaign
router.delete('/:id', auth, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndDelete(req.params.id);
        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
