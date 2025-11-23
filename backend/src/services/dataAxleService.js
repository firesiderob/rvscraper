// backend/src/services/dataAxleService.js
// Data Axle API Integration for RV Owner Lists

const axios = require('axios');

/**
 * Data Axle API Service
 * 
 * To use this service:
 * 1. Sign up at https://www.data-axle.com
 * 2. Request API access (usually requires sales call)
 * 3. Add credentials to .env file:
 *    - DATA_AXLE_API_KEY=your_api_key
 *    - DATA_AXLE_API_SECRET=your_secret
 *    - DATA_AXLE_BASE_URL=https://api.data-axle.com/v1 (or provided endpoint)
 */

class DataAxleService {
    constructor() {
        this.apiKey = process.env.DATA_AXLE_API_KEY;
        this.apiSecret = process.env.DATA_AXLE_API_SECRET;
        this.baseUrl = process.env.DATA_AXLE_BASE_URL || 'https://api.data-axle.com/v1';
        this.mockMode = !this.apiKey || process.env.DATA_AXLE_MOCK_MODE === 'true';

        if (this.mockMode) {
            console.log('⚠️  Data Axle running in MOCK MODE (no API credentials)');
        }
    }

    /**
     * Search for RV owners by criteria
     * @param {Object} criteria - Search parameters
     * @param {string} criteria.state - State abbreviation (e.g., 'TX')
     * @param {string} criteria.city - City name (optional)
     * @param {string} criteria.zipCode - ZIP code (optional)
     * @param {number} criteria.limit - Max results (default: 100)
     * @returns {Promise<Array>} - Array of RV owner leads
     */
    async searchRVOwners(criteria) {
        const { state, city, zipCode, limit = 100 } = criteria;

        if (this.mockMode) {
            return this.generateMockData(criteria);
        }

        try {
            // Real Data Axle API call
            const response = await axios.post(
                `${this.baseUrl}/consumers/search`,
                {
                    filters: {
                        // Lifestyle indicators for RV owners
                        interests: ['RV_OWNER', 'CAMPING', 'OUTDOOR_RECREATION'],
                        geography: {
                            state: state,
                            city: city,
                            zipCode: zipCode
                        }
                    },
                    fields: [
                        'firstName',
                        'lastName',
                        'fullName',
                        'address',
                        'city',
                        'state',
                        'zipCode',
                        'phone',
                        'email',
                        'ageRange',
                        'income',
                        'homeOwner',
                        'rvOwnership' // If available
                    ],
                    limit: limit
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'X-API-Secret': this.apiSecret,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return this.formatDataAxleResults(response.data.results || []);

        } catch (error) {
            console.error('Data Axle API Error:', error.message);
            throw new Error(`Data Axle search failed: ${error.message}`);
        }
    }

    /**
     * Format Data Axle results to our Lead schema
     */
    formatDataAxleResults(results) {
        return results.map(record => ({
            ownerName: record.fullName || `${record.firstName} ${record.lastName}`,
            businessName: 'RV Owner',
            phone: this.formatPhone(record.phone),
            email: record.email,
            address: record.address,
            city: record.city,
            state: record.state,
            zipCode: record.zipCode,
            demographics: {
                ageRange: record.ageRange,
                income: record.income,
                homeOwner: record.homeOwner
            },
            source: 'Data Axle',
            leadSource: 'DataAxle',
            type: 'RV Owner',
            dataAxleId: record.id // For preventing duplicates
        }));
    }

    /**
     * Format phone number to (XXX) XXX-XXXX
     */
    formatPhone(phone) {
        if (!phone) return null;
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return phone;
    }

    /**
     * Generate mock data for testing/demo purposes
     */
    generateMockData(criteria) {
        const { state, city, limit = 100 } = criteria;

        console.log(`📊 Generating ${limit} mock Data Axle records for ${city || state}...`);

        const mockRecords = [];
        const firstNames = ['John', 'Sarah', 'Michael', 'Jennifer', 'David', 'Lisa', 'Robert', 'Karen', 'Chris', 'Amanda'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        const streets = ['Main', 'Oak', 'Maple', 'Cedar', 'Elm', 'Pine', 'Lake', 'River', 'Hill', 'Park'];
        const rvBrands = ['Winnebago', 'Airstream', 'Thor', 'Forest River', 'Jayco', 'Grand Design', 'Keystone', 'Dutchmen'];

        for (let i = 0; i < Math.min(limit, 100); i++) {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const streetName = streets[Math.floor(Math.random() * streets.length)];
            const brand = rvBrands[Math.floor(Math.random() * rvBrands.length)];

            mockRecords.push({
                ownerName: `${firstName} ${lastName}`,
                businessName: `${brand} RV Owner`,
                phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${['gmail.com', 'yahoo.com', 'hotmail.com'][Math.floor(Math.random() * 3)]}`,
                address: `${Math.floor(Math.random() * 9000) + 1000} ${streetName} St`,
                city: city || `${state} City`,
                state: state,
                zipCode: `${Math.floor(Math.random() * 90000) + 10000}`,
                demographics: {
                    ageRange: ['45-54', '55-64', '65-74'][Math.floor(Math.random() * 3)],
                    income: ['$75K-$100K', '$100K-$150K', '$150K+'][Math.floor(Math.random() * 3)],
                    homeOwner: true
                },
                source: 'Data Axle (MOCK)',
                leadSource: 'DataAxle',
                type: 'RV Owner',
                dataAxleId: `MOCK_${i}_${Date.now()}`
            });
        }

        return mockRecords;
    }

    /**
     * Get account status / credits remaining
     */
    async getAccountInfo() {
        if (this.mockMode) {
            return {
                mockMode: true,
                creditsRemaining: 999999,
                plan: 'Demo/Mock Mode',
                message: 'Add DATA_AXLE_API_KEY to .env to use real API'
            };
        }

        try {
            const response = await axios.get(
                `${this.baseUrl}/account`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'X-API-Secret': this.apiSecret
                    }
                }
            );

            return {
                mockMode: false,
                creditsRemaining: response.data.creditsRemaining,
                plan: response.data.planName,
                monthlyAllowance: response.data.monthlyAllowance
            };
        } catch (error) {
            console.error('Failed to get Data Axle account info:', error.message);
            return { error: error.message };
        }
    }
}

module.exports = new DataAxleService();
