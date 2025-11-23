// backend/src/templates/emailTemplates.js

const emailTemplates = {
    rv_owner_intro: {
        name: 'RV Owner Introduction',
        subject: 'Fellow Christian RV Owner - Income Opportunity?',
        body: `Hi {{firstName}},

My name is {{senderName}} and I'm reaching out from Fireside RV Rental - a Christian-based RV rental franchise dedicated to helping RV owners like you.

**Our Mission:** Help Christian families steward their assets wisely while creating opportunities for others to experience the blessing of RV adventures.

I noticed you have a {{rvYear}} {{rvMake}} {{rvModel}}{{#if rvType}} {{rvType}}{{/if}}. When you're not using it, your RV could be earning income for your family while blessing others.

**What We Offer:**
• Professional RV rental management
• Insurance and liability coverage
• Screening of renters
• Maintenance coordination
• Faith-based business practices

**No Gimmicks. No Pressure.**
Just a conversation about how we can help you steward your assets while serving others.

Would you be open to a brief chat? You can:
📞 Call me directly: {{senderPhone}}
📧 Reply to this email
📅 Book a time: {{calendarLink}}

Blessings,
{{senderName}}
{{senderTitle}}
Fireside RV Rental

---

**Not interested?** No problem - click here to unsubscribe: {{unsubscribeLink}}

This email was sent by:
Fireside RV Rental
{{physicalAddress}}

We operate with Christian values: Integrity, Excellence, and Service to Others.`
    },

    rv_tech_partnership: {
        name: 'RV Tech Partnership',
        subject: 'Christian RV Tech - Franchise Partnership Opportunity',
        body: `Hi {{firstName}},

I'm reaching out to Christian-minded RV technicians with an opportunity that might interest you.

Fireside RV Rental is building a faith-based franchise network, and we're looking for skilled RV techs who want to:

✝️ Build a business on Christian principles
🔧 Use your expertise to serve others
💰 Earn solid income doing what you love
🤝 Partner with like-minded believers

**Why Partner with Us?**
• Steady stream of RV maintenance work
• Fair compensation and transparency
• Faith-based business practices
• Supportive community of believers
• Franchise opportunities available

**Our Values:**
We believe in treating customers, partners, and equipment with excellence - as unto the Lord.

**Next Steps:**
If this resonates with you, let's talk:
📞 {{senderPhone}}
📧 Reply to this email
📅 {{calendarLink}}

In His Service,
{{senderName}}

---

Unsubscribe: {{unsubscribeLink}}
Fireside RV Rental | {{physicalAddress}}`
    },

    follow_up_value: {
        name: 'Follow-Up with Value',
        subject: 'Free Resource: RV Income Guide (Christian Perspective)',
        body: `Hi {{firstName}},

I reached out last week about Fireside RV Rental. Whether or not you decide to partner with us, I wanted to share something valuable.

**FREE eBook:** "7 Ways to Monetize Your RV the Right Way"

This guide covers:
• Tax benefits of RV rental (legal)
• Insurance considerations
• Pricing your RV competitively
• Screening renters properly
• Maintaining your asset
• Biblical stewardship principles
• Real success stories from believers

**Download here:** {{downloadLink}}

No strings attached - just value from one believer to another.

If you have questions as you read it, I'm here:
📧 {{senderEmail}}
📞 {{senderPhone}}

Blessings,
{{senderName}}

P.S. If you do decide to explore partnership in the future, just reply to this email.

---

Unsubscribe: {{unsubscribeLink}}
Fireside RV Rental | {{physicalAddress}}`
    },

    general_outreach: {
        name: 'General Christian Outreach',
        subject: 'A Message from Fireside RV Rental',
        body: `Hi {{firstName}},

{{customMessage}}

If you'd like to learn more or have any questions, feel free to reach out:
📞 {{senderPhone}}
📧 {{senderEmail}}

Blessings,
{{senderName}}
{{senderTitle}}
Fireside RV Rental

---

Unsubscribe: {{unsubscribeLink}}
Fireside RV Rental | {{physicalAddress}}`
    }
};

// Template variable helper
function replaceVariables(template, variables) {
    let result = template;

    // Replace simple variables
    Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, variables[key] || '');
    });

    // Handle conditional blocks {{#if field}}...{{/if}}
    result = result.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/g, (match, field, content) => {
        return variables[field] ? content : '';
    });

    return result;
}

// Generate unsubscribe link
function generateUnsubscribeLink(email, campaignId) {
    const crypto = require('crypto');
    const token = crypto.createHash('sha256')
        .update(`${email}-${campaignId}-${process.env.JWT_SECRET}`)
        .digest('hex');

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${baseUrl}/unsubscribe?token=${token}&email=${encodeURIComponent(email)}`;
}

// Build email from template
function buildEmail(templateName, leadData, campaignData, senderInfo) {
    const template = emailTemplates[templateName];
    if (!template) {
        throw new Error(`Template ${templateName} not found`);
    }

    const variables = {
        // Lead data
        firstName: leadData.businessName?.split(' ')[0] || 'Friend',
        businessName: leadData.businessName || '',
        rvYear: leadData.rvDetails?.year || '',
        rvMake: leadData.rvDetails?.make || '',
        rvModel: leadData.rvDetails?.model || '',
        rvType: leadData.rvDetails?.rvType || '',
        city: leadData.city || '',
        state: leadData.state || '',

        // Sender info
        senderName: senderInfo.name || 'Fireside Team',
        senderTitle: senderInfo.title || 'Partnership Director',
        senderEmail: senderInfo.email || 'contact@fireside.com',
        senderPhone: senderInfo.phone || '(555) 123-4567',

        // Campaign info
        physicalAddress: campaignData.physicalAddress || '123 Main St, Austin, TX 78701',
        calendarLink: campaignData.calendarLink || 'https://calendly.com/fireside',
        downloadLink: campaignData.downloadLink || 'https://fireside.com/guide',
        customMessage: campaignData.customMessage || '',

        // System
        unsubscribeLink: generateUnsubscribeLink(leadData.email, campaignData._id)
    };

    return {
        subject: replaceVariables(template.subject, variables),
        body: replaceVariables(template.body, variables),
        html: replaceVariables(template.body, variables).replace(/\n/g, '<br>')
    };
}

module.exports = {
    emailTemplates,
    buildEmail,
    generateUnsubscribeLink,
    replaceVariables
};
