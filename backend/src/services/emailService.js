// backend/src/services/emailService.js
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Campaign = require('../models/Campaign');
const Unsubscribe = require('../models/Unsubscribe');
const Lead = require('../models/Lead');
const emailTemplates = require('../templates/emailTemplates');

// Transport configuration (environment variables)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Generate a unique unsubscribe token for a given email.
 * Simple hash of email + secret (replace with signed JWT in production).
 */
function generateUnsubscribeToken(email) {
    return crypto.createHash('sha256')
        .update(`${email}-${process.env.JWT_SECRET}`)
        .digest('hex');
}

/**
 * Send a campaign email to a lead using a template.
 * Handles unsubscribe check, token generation, open tracking pixel.
 */
async function sendCampaignEmail(campaignId, leadId) {
    const campaign = await Campaign.findById(campaignId);
    const lead = await Lead.findById(leadId);
    if (!campaign || !lead) throw new Error('Invalid campaign or lead');

    // Do not send if email is unsubscribed
    const isUnsub = await Unsubscribe.isUnsubscribed(lead.email);
    if (isUnsub) {
        console.log(`Skipping unsubscribed email: ${lead.email}`);
        return { skipped: true };
    }

    // Choose template based on campaign.template field
    const templateFn = emailTemplates[campaign.template];
    if (!templateFn) throw new Error(`Template ${campaign.template} not found`);

    // Build substitution variables
    const vars = {
        firstName: lead.firstName || lead.businessName || 'Friend',
        rvYear: lead.rvDetails?.year || '',
        rvMake: lead.rvDetails?.make || '',
        rvModel: lead.rvDetails?.model || '',
        rvType: lead.rvDetails?.type || '',
        yourName: process.env.FROM_NAME || 'Fireside Team',
        yourTitle: process.env.FROM_TITLE || 'Founder',
        yourPhone: process.env.FROM_PHONE || '+1-555-123-4567',
        physicalAddress: process.env.PHYSICAL_ADDRESS || '123 Faith St, City, State ZIP',
        calendarLink: process.env.CALENDAR_LINK || 'https://calendly.com/fireside',
        unsubscribeLink: `${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(lead.email)}&token=${generateUnsubscribeToken(lead.email)}`,
        downloadLink: process.env.EBOOK_LINK || 'https://example.com/rv-income-guide.pdf'
    };

    // Render template (simple replace {{var}})
    const rawHtml = templateFn(vars);
    const html = rawHtml.replace(/{{(\w+)}}/g, (_, key) => vars[key] || '');

    // Add open tracking pixel (transparent 1x1 image)
    const trackingUrl = `${process.env.BACKEND_URL}/api/campaigns/${campaignId}/track/open/${leadId}`;
    const htmlWithPixel = `${html}<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt=""/>`;

    const mailOptions = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: lead.email,
        subject: campaign.subject || 'Important Update from Fireside',
        html: htmlWithPixel,
        headers: {
            'List-Unsubscribe': `<${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(lead.email)}&token=${generateUnsubscribeToken(lead.email)}>`
        }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    // Update campaign analytics
    await Campaign.findByIdAndUpdate(campaignId, {
        $inc: { 'analytics.sent': 1 }
    });
    return { messageId: info.messageId };
}

/**
 * Record open tracking (called by pixel request)
 */
async function recordOpen(campaignId, leadId) {
    await Campaign.findByIdAndUpdate(campaignId, {
        $inc: { 'analytics.opened': 1 }
    });
    await Lead.findByIdAndUpdate(leadId, { $set: { 'compliance.emailOpenedAt': new Date() } });
    return true;
}

module.exports = {
    sendCampaignEmail,
    recordOpen
};
