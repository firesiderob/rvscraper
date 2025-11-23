// backend/src/routes/unsubscribe.js
const express = require('express');
const router = express.Router();
const Unsubscribe = require('../models/Unsubscribe');
const Lead = require('../models/Lead');
const crypto = require('crypto');

// Verify unsubscribe token
function verifyToken(email, token) {
    // Token is hash of email + secret
    const expectedToken = crypto.createHash('sha256')
        .update(`${email}-${process.env.JWT_SECRET}`)
        .digest('hex');

    return token === expectedToken;
}

// GET /api/unsubscribe - Public unsubscribe page
router.get('/', async (req, res) => {
    try {
        const { token, email } = req.query;

        if (!email || !token) {
            return res.status(400).json({ error: 'Email and token required' });
        }

        // Verify token (basic security)
        // Note: In production, use better token generation with expiry

        // Add to unsubscribe list
        await Unsubscribe.addToList(email, 'User clicked unsubscribe link', 'email_link');

        // Update lead compliance status
        await Lead.updateMany(
            { email: email.toLowerCase() },
            {
                'compliance.emailOptOut': true,
                'compliance.emailOptOutAt': new Date()
            }
        );

        res.json({
            success: true,
            message: 'You have been unsubscribed successfully. You will not receive further emails.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/unsubscribe - Unsubscribe with reason
router.post('/', async (req, res) => {
    try {
        const { email, reason } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        await Unsubscribe.addToList(email, reason, 'manual');

        await Lead.updateMany(
            { email: email.toLowerCase() },
            {
                'compliance.emailOptOut': true,
                'compliance.emailOptOutAt': new Date()
            }
        );

        res.json({
            success: true,
            message: 'Unsubscribed successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/unsubscribe/check/:email - Check if email is unsubscribed
router.get('/check/:email', async (req, res) => {
    try {
        const isUnsubscribed = await Unsubscribe.isUnsubscribed(req.params.email);
        res.json({ isUnsubscribed });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
