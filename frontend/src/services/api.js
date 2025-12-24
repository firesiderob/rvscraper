// frontend/src/services/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://unsuperseded-melani-nondemonstrably.ngrok-free.dev/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (email, password, name) => api.post('/auth/register', { email, password, name });
export const getCurrentUser = () => api.get('/auth/me');

// Leads
export const getLeads = (params) => api.get('/leads', { params });
export const getLead = (id) => api.get(`/leads/${id}`);
export const createLead = (data) => api.post('/leads', data);
export const updateLead = (id, data) => api.patch(`/leads/${id}`, data);
export const deleteLead = (id) => api.delete(`/leads/${id}`);
export const toggleDNC = (id) => api.patch(`/leads/${id}/toggle-dnc`);
export const getLeadStats = () => api.get('/leads/stats/summary');
export const getRvtiTechs = (params) => api.get('/leads/rvti-techs', { params });

// Scrapers
export const scrapeUHaul = (state, limit) => api.post(`/scraper/uhaul/${state}`, { limit });
export const scrapeRVTech = (state, city, limit) => api.post(`/scraper/rvtech/${state}`, { city, limit });
export const scrapeAllUHaul = (limit) => api.post('/scraper/uhaul/all', { limit });
export const scrapeAllRVTech = (limit) => api.post('/scraper/rvtech/all', { limit });
export const searchAgent = (query, limit) => api.post('/scraper/search', { query, limit });

// RV Owner Scrapers
export const scrapeRVTrader = (state, city, rvType, limit) => api.post('/scraper/rvowners/rvtrader', { state, city, rvType, limit });
export const scrapeCraigslist = (city, state, limit) => api.post('/scraper/rvowners/craigslist', { city, state, limit });
export const searchDataAxle = (state, city, zipCode, limit) => api.post('/scraper/rvowners/dataaxle', { state, city, zipCode, limit });
export const getDataAxleAccount = () => api.get('/scraper/dataaxle/account');

// Campaigns
export const getCampaigns = () => api.get('/campaigns');
export const getCampaign = (id) => api.get(`/campaigns/${id}`);
export const createCampaign = (data) => api.post('/campaigns', data);
export const sendCampaign = (id) => api.post(`/campaigns/${id}/send`);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`);

// Visitors (Tracking)
export const getVisitors = (params) => api.get('/visitors', { params });
export const getVisitorStats = () => api.get('/visitors/stats');
export const exportVisitorsFacebook = (onlyNew) => api.get('/visitors/export/facebook', { params: { onlyNew }, responseType: 'blob' });
export const deleteVisitor = (id) => api.delete(`/visitors/${id}`);

// Lead Enrichment
export const enrichLead = (id) => api.post(`/leads/${id}/enrich`);
export const enrichLeadsBulk = (ids) => api.post('/leads/enrich-bulk', { ids });

// Good Leads Export
export const exportGoodLeads = () => api.get('/leads/export/facebook', { responseType: 'blob' });
export const markLeadAsGood = (id) => api.patch(`/leads/${id}/mark-good`);
export const getGoodLeads = () => api.get('/leads/good');

export default api;
