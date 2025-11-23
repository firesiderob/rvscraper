// backend/src/utils/validators.js

/**
 * Validate and format US phone numbers
 * @param {string} phoneStr - Raw phone number string
 * @returns {string|null} - Formatted phone number or null if invalid
 */
function validatePhone(phoneStr) {
    if (!phoneStr) return null;

    // Remove all non-digits
    const digits = phoneStr.replace(/\D/g, '');

    // US phone: must be 10 digits (or 11 with country code)
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    // Invalid format
    return null;
}

/**
 * Validate email and calculate quality score
 * @param {string} email - Email address to validate
 * @returns {object} - {valid: boolean, score: number, email: string, reason: string}
 */
function validateEmail(email) {
    if (!email) return { valid: false, score: 0 };

    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, score: 0, reason: 'invalid_format' };
    }

    // Convert to lowercase for comparison
    const lowerEmail = email.toLowerCase();

    // Blocklist (generic business emails)
    const blocklist = [
        'info@', 'sales@', 'support@', 'contact@',
        'admin@', 'webmaster@', 'noreply@', 'no-reply@',
        'marketing@', 'hello@', 'help@', 'service@',
        'customerservice@', 'office@', 'team@'
    ];

    if (blocklist.some(prefix => lowerEmail.startsWith(prefix))) {
        return { valid: false, score: 0, reason: 'generic_email' };
    }

    // Quality scoring (0-100, higher = better)
    let score = 50; // Base score

    // Personal name patterns boost score
    // Pattern: firstname.lastname@domain.com
    if (/^[a-z]+\.[a-z]+@/.test(lowerEmail)) {
        score += 30;
    }
    // Pattern: firstname@domain.com
    else if (/^[a-z]{3,}@/.test(lowerEmail)) {
        score += 20;
    }

    // Personal email providers boost score
    const personalDomains = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'icloud.com', 'aol.com', 'protonmail.com', 'me.com',
        'mail.com', 'ymail.com', 'live.com'
    ];

    if (personalDomains.some(domain => lowerEmail.includes(`@${domain}`))) {
        score += 20;
    }

    // Penalize business-looking patterns
    if (lowerEmail.includes('business') || lowerEmail.includes('company')) {
        score -= 20;
    }

    return {
        valid: true,
        score: Math.max(0, Math.min(100, score)), // Clamp 0-100
        email,
        reason: null
    };
}

/**
 * Validate and clean seller/owner name
 * @param {string} name - Raw name string
 * @returns {string|null} - Cleaned name or null if invalid
 */
function validateName(name) {
    if (!name || typeof name !== 'string') return null;

    const trimmed = name.trim();

    // Filter out generic placeholders
    const invalidNames = [
        'private seller',
        'seller',
        'owner',
        'dealer',
        'n/a',
        'unknown',
        'contact seller'
    ];

    if (invalidNames.includes(trimmed.toLowerCase())) {
        return null;
    }

    // Must have at least 2 characters
    if (trimmed.length < 2) return null;

    // Title case the name
    return trimmed
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

module.exports = {
    validatePhone,
    validateEmail,
    validateName
};
