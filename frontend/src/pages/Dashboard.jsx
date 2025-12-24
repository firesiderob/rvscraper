// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { getLeads, deleteLead, getLeadStats, scrapeUHaul, scrapeRVTech, searchAgent, scrapeRVTrader, scrapeCraigslist, searchDataAxle, getRvtiTechs, getVisitors, getVisitorStats, exportVisitorsFacebook, enrichLead, enrichLeadsBulk, markLeadAsGood, exportGoodLeads, getGoodLeads } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

export default function Dashboard() {
    const [leads, setLeads] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ state: '', type: '', status: '', search: '' });
    const [scraping, setScraping] = useState(false);
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'leads', 'search', 'rvowners', 'rvtechs', 'visitors', 'goodleads'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const { logout } = useAuth();
    const [modal, setModal] = useState({ show: false, type: '', data: null });
    const [ghlUrl, setGhlUrl] = useState('');
    const [maxResults, setMaxResults] = useState(50); // Default to 50

    // Visitor tracking state
    const [visitors, setVisitors] = useState([]);
    const [visitorStats, setVisitorStats] = useState(null);
    const [visitorLoading, setVisitorLoading] = useState(false);

    // Good leads state
    const [goodLeads, setGoodLeads] = useState([]);
    const [enriching, setEnriching] = useState(new Set());

    // RV Owner search state
    const [rvSource, setRvSource] = useState('rvtrader'); // 'rvtrader', 'craigslist', or 'dataaxle'
    const [rvZip, setRvZip] = useState(''); // For Data Axle ZIP targeting
    const [rvState, setRvState] = useState('');
    const [rvCity, setRvCity] = useState('');
    const [rvType, setRvType] = useState('');

    // RVTI Techs state
    const [rvtiTechs, setRvtiTechs] = useState([]);
    const [rvtiFranchises, setRvtiFranchises] = useState([]);
    const [rvtiFilters, setRvtiFilters] = useState({ franchise: '', state: '', search: '' });
    const [rvtiLoading, setRvtiLoading] = useState(false);

    useEffect(() => {
        fetchLeads();
        fetchStats();
    }, [filters]);

    const fetchLeads = async () => {
        try {
            const response = await getLeads(filters);
            setLeads(response.data.leads);
            // Auto-expand all groups initially
            const sources = new Set(response.data.leads.map(l => l.source || 'Other'));
            setExpandedGroups(sources);
        } catch (error) {
            console.error('Error fetching leads:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await getLeadStats();
            setStats(response.data);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchRvtiTechs = async () => {
        setRvtiLoading(true);
        try {
            const response = await getRvtiTechs(rvtiFilters);
            setRvtiTechs(response.data.techs || []);
            setRvtiFranchises(response.data.franchises || []);
        } catch (error) {
            console.error('Error fetching RVTI techs:', error);
        } finally {
            setRvtiLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'rvtechs') {
            fetchRvtiTechs();
        }
        if (activeTab === 'visitors') {
            fetchVisitors();
            fetchVisitorStats();
        }
        if (activeTab === 'goodleads') {
            fetchGoodLeads();
        }
    }, [activeTab, rvtiFilters]);

    const fetchVisitors = async () => {
        setVisitorLoading(true);
        try {
            const response = await getVisitors({ limit: 100 });
            setVisitors(response.data.visitors || []);
        } catch (error) {
            console.error('Error fetching visitors:', error);
        } finally {
            setVisitorLoading(false);
        }
    };

    const fetchVisitorStats = async () => {
        try {
            const response = await getVisitorStats();
            setVisitorStats(response.data);
        } catch (error) {
            console.error('Error fetching visitor stats:', error);
        }
    };

    const fetchGoodLeads = async () => {
        try {
            const response = await getGoodLeads();
            setGoodLeads(response.data.leads || []);
        } catch (error) {
            console.error('Error fetching good leads:', error);
        }
    };

    const handleEnrichLead = async (leadId) => {
        setEnriching(prev => new Set([...prev, leadId]));
        try {
            const response = await enrichLead(leadId);
            fetchLeads();
            const summary = response.data?.summary;
            if (summary?.message) {
                alert(summary.message);
            } else {
                alert('Lead enriched successfully!');
            }
        } catch (error) {
            alert('Error enriching lead: ' + (error.response?.data?.error || error.message));
        } finally {
            setEnriching(prev => {
                const next = new Set(prev);
                next.delete(leadId);
                return next;
            });
        }
    };

    const handleEnrichSelected = async () => {
        if (selectedLeads.size === 0) return;
        try {
            await enrichLeadsBulk(Array.from(selectedLeads));
            alert(`Enriching ${selectedLeads.size} leads in background. Check back in a few minutes.`);
        } catch (error) {
            alert('Error starting bulk enrichment');
        }
    };

    const handleMarkGood = async (leadId) => {
        console.log('handleMarkGood called with:', leadId);
        try {
            const response = await markLeadAsGood(leadId);
            console.log('markLeadAsGood response:', response);
            fetchLeads();
            if (activeTab === 'goodleads') fetchGoodLeads();
        } catch (error) {
            console.error('Error marking lead:', error);
            alert('Error marking lead: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleExportGoodLeads = async () => {
        try {
            const response = await exportGoodLeads();
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'good_leads_facebook.csv';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('Error exporting leads');
        }
    };

    const handleExportVisitorsFacebook = async () => {
        try {
            const response = await exportVisitorsFacebook(false);
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'visitors_facebook.csv';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('Error exporting visitors');
        }
    };

    const getPixelCode = () => {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        return `<script>
  window.FIRESIDE_API = '${apiUrl.replace('/api', '')}/api/visitors';
</script>
<script src="${apiUrl.replace('/api', '')}/tracking.js"></script>`;
    };

    const handleDeleteClick = (id) => {
        setModal({ show: true, type: 'delete', data: id });
    };

    const handleBulkDeleteClick = () => {
        if (selectedLeads.size === 0) return;
        setModal({ show: true, type: 'bulk-delete', data: null });
    };

    const handleExportClick = (lead) => {
        const savedUrl = localStorage.getItem('ghl_webhook_url') || '';
        setGhlUrl(savedUrl);
        setModal({ show: true, type: 'export', data: lead });
    };

    const confirmAction = async () => {
        if (modal.type === 'delete') {
            try {
                await deleteLead(modal.data);
                fetchLeads();
                fetchStats();
            } catch (error) {
                alert('Error deleting lead');
            }
        } else if (modal.type === 'bulk-delete') {
            try {
                for (const id of selectedLeads) {
                    await deleteLead(id);
                }
                setSelectedLeads(new Set());
                fetchLeads();
                fetchStats();
            } catch (error) {
                alert('Error deleting leads');
            }
        } else if (modal.type === 'export') {
            if (!ghlUrl) return alert('Please enter a Webhook URL');
            localStorage.setItem('ghl_webhook_url', ghlUrl);
            alert(`Exporting ${modal.data ? modal.data.businessName : selectedLeads.size + ' leads'} to GHL...`);
        }
        setModal({ show: false, type: '', data: null });
    };

    const toggleSelectAll = (groupLeads) => {
        const newSelected = new Set(selectedLeads);
        const allSelected = groupLeads.every(l => selectedLeads.has(l._id));

        groupLeads.forEach(l => {
            if (allSelected) {
                newSelected.delete(l._id);
            } else {
                newSelected.add(l._id);
            }
        });
        setSelectedLeads(newSelected);
    };

    const toggleSelectOne = (id) => {
        const newSelected = new Set(selectedLeads);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedLeads(newSelected);
    };

    const toggleGroup = (source) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(source)) {
            newExpanded.delete(source);
        } else {
            newExpanded.add(source);
        }
        setExpandedGroups(newExpanded);
    };

    const handleScrape = async (type, state) => {
        setScraping(true);
        try {
            if (type === 'uhaul') {
                await scrapeUHaul(state, 20);
            } else {
                await scrapeRVTech(state, '', 20);
            }
            alert(`Scraping started for ${state}.Check back in a few minutes.`);
            setTimeout(() => {
                fetchLeads();
                fetchStats();
            }, 5000);
        } catch (error) {
            alert('Error starting scraper');
        } finally {
            setScraping(false);
        }
    };

    // Search History state
    const [searchHistory, setSearchHistory] = useState(() => {
        try {
            const saved = localStorage.getItem('search_history');
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error parsing search history:', e);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('search_history', JSON.stringify(searchHistory));
    }, [searchHistory]);

    const addToHistory = (query) => {
        setSearchHistory(prev => {
            const newHistory = [query, ...prev.filter(q => q !== query)].slice(0, 10);
            return newHistory;
        });
    };

    const handleSearchAgent = async (e) => {
        e.preventDefault();
        if (!searchQuery) return;

        setScraping(true);
        addToHistory(searchQuery);
        try {
            await searchAgent(searchQuery, maxResults);
            alert(`Search Agent started for "${searchQuery}". Results will appear shortly.`);
            setSearchQuery('');
            setTimeout(() => {
                fetchLeads();
                fetchStats();
                setActiveTab('leads');
            }, 15000);
        } catch (error) {
            alert('Error running Search Agent');
        } finally {
            setScraping(false);
        }
    };

    // RV Owner Search Handler
    const handleRVOwnerSearch = async (e) => {
        e.preventDefault();
        if (!rvState) {
            console.log('⚠️  State is required for RV Owner search');
            return;
        }

        console.log(`🔍 Starting RV Owner search: Source=${rvSource}, City=${rvCity}, State=${rvState}, Max=${maxResults}`);
        setScraping(true);
        setLoading(true);
        try {
            if (rvSource === 'rvtrader') {
                console.log('Calling RVTrader scraper...');
                await scrapeRVTrader(rvState, rvCity, rvType, maxResults);
            } else if (rvSource === 'craigslist') {
                console.log('Calling Craigslist scraper...');
                const result = await scrapeCraigslist(rvCity || rvState, rvState, maxResults);
                console.log('✅ Craigslist scraper completed!');
                console.log('   Leads found:', result.data.count || 0);
                console.log('   Response:', result.data);
            } else if (rvSource === 'dataaxle') {
                console.log('Calling Data Axle...');
                const result = await searchDataAxle(rvState, rvCity, rvZip, maxResults);
                console.log('✅ Data Axle search completed!');
                console.log('   Leads found:', result.data.count || 0);
                console.log('   Mock mode:', result.data.mockMode || false);
                console.log('   Response:', result.data);
            }
            console.log('✅ Scraper called successfully, waiting 15s for results...');
            setTimeout(() => {
                fetchLeads();
                fetchStats();
                setActiveTab('rvowners'); // Stay on RV owners tab to see results
            }, 15000);
        } catch (error) {
            console.error('❌ Error running RV Owner search:', error);
            alert(`Error: ${error.message || 'Failed to start scraper'}`);
        } finally {
            setScraping(false);
            // loading will be set to false in fetchLeads's finally block
        }
    };

    const handleContinueSearch = async (source) => {
        // Extract query from source string "Google Maps Search: [Query]"
        const prefix = "Google Maps Search: ";
        if (!source.startsWith(prefix)) return;

        const query = source.substring(prefix.length);
        if (!query) return;

        setScraping(true);
        setLoading(true);
        try {
            await searchAgent(query, 50); // Default to 50 for continue search
            setTimeout(() => {
                fetchLeads();
                fetchStats();
            }, 15000);
        } catch (error) {
            console.error('Error continuing search:', error);
        } finally {
            setScraping(false);
            // loading will be set to false in fetchLeads's finally block
        }
    };

    const handleExportCSV = (groupLeads, filename) => {
        if (!groupLeads || groupLeads.length === 0) return;

        // Define headers (quoted for CSV)
        const headers = ['Business Name', 'Type', 'Address', 'City', 'State', 'Zip', 'Phone', 'Email', 'Website', 'Status', 'Source', 'Notes']
            .map(h => `"${h}"`);

        // Convert leads to CSV rows
        const rows = groupLeads.map(lead => [
            lead.businessName,
            lead.type,
            lead.address || '',
            lead.city || '',
            lead.state || '',
            lead.zip || '',
            lead.phone || '',
            lead.email || '',
            lead.website || '',
            lead.status,
            lead.source || '',
            lead.notes || ''
        ].map(field => {
            const str = (field || '').toString();
            // Escape quotes and wrap in quotes
            return `"${str.replace(/"/g, '""')}"`;
        }).join(','));

        // Combine headers and rows with proper line breaks
        const csvContent = [headers.join(','), ...rows].join('\r\n');

        // Create download link with proper BOM for Excel compatibility
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    // ... (keep existing helper functions)

    // Group leads by source for rendering
    const groupedLeads = leads.reduce((acc, lead) => {
        const src = lead.source || 'Other';
        if (!acc[src]) acc[src] = [];
        acc[src].push(lead);
        return acc;
    }, {});

    return (
        <div className="dashboard">
            {/* Search Status Banner */}
            {scraping && (
                <div className="search-status-banner">
                    <div className="search-status-content">
                        <span className="spinner">⏳</span>
                        <span>Search in progress... Please wait while we find more leads.</span>
                    </div>
                </div>
            )}

            {/* ... (keep existing modal code) ... */}
            {modal.show && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>
                            {modal.type === 'delete' && 'Delete Lead?'}
                            {modal.type === 'bulk-delete' && `Delete ${selectedLeads.size} Leads?`}
                            {modal.type === 'export' && 'Export to GoHighLevel'}
                        </h3>

                        {modal.type === 'export' ? (
                            <div className="modal-body">
                                <p>Enter your GoHighLevel Webhook URL:</p>
                                <input
                                    type="text"
                                    value={ghlUrl}
                                    onChange={(e) => setGhlUrl(e.target.value)}
                                    placeholder="https://services.leadconnectorhq.com/hooks/..."
                                    className="modal-input"
                                />
                            </div>
                        ) : (
                            <p>Are you sure you want to proceed? This action cannot be undone.</p>
                        )}

                        <div className="modal-actions">
                            <button onClick={() => setModal({ show: false, type: '', data: null })} className="cancel-btn">Cancel</button>
                            <button onClick={confirmAction} className="confirm-btn">
                                {modal.type === 'export' ? 'Export' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="dashboard-header">
                <h1>🔥 Fireside Lead Gen</h1>
                <div className="header-actions">
                    <button
                        className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
                        onClick={() => setActiveTab('home')}
                    >
                        Home
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
                        onClick={() => setActiveTab('leads')}
                    >
                        Leads
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                        onClick={() => setActiveTab('search')}
                    >
                        Search Agents
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'rvowners' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rvowners')}
                    >
                        RV Owners
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'rvtechs' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rvtechs')}
                    >
                        RV Techs
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'visitors' ? 'active' : ''}`}
                        onClick={() => setActiveTab('visitors')}
                    >
                        Visitors
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'goodleads' ? 'active' : ''}`}
                        onClick={() => setActiveTab('goodleads')}
                    >
                        Good Leads
                    </button>
                    <button onClick={logout} className="logout-btn">Logout</button>
                </div>
            </header>

            {stats && (
                <div className="stats-grid">
                    {/* ... (keep existing stats cards) ... */}
                    <div className="stat-card">
                        <h3>Total Leads</h3>
                        <p className="stat-number">{stats.total}</p>
                    </div>
                    <div className="stat-card">
                        <h3>RV Techs</h3>
                        <p className="stat-number">
                            {stats.byType?.find(t => t._id === 'RV Tech')?.count || 0}
                        </p>
                    </div>
                    <div className="stat-card">
                        <h3>U-Haul</h3>
                        <p className="stat-number">
                            {stats.byType?.find(t => t._id === 'U-Haul')?.count || 0}
                        </p>
                    </div>
                    <div className="stat-card">
                        <h3>New Leads</h3>
                        <p className="stat-number">
                            {stats.byStatus?.find(s => s._id === 'New')?.count || 0}
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'home' ? (
                <div className="home-container">
                    <div className="home-header">
                        <h2>Start Here</h2>
                        <p>Select a method to find new leads</p>
                    </div>
                    <div className="home-grid">
                        <div className="home-card" onClick={() => setActiveTab('search')}>
                            <div className="home-card-icon">🤖</div>
                            <h3>Search Agents</h3>
                            <p>Find RV repair shops, mobile techs, and dealerships using Google Maps.</p>
                            <button className="home-card-btn">
                                Go to Search Agents →
                            </button>
                        </div>
                        <div className="home-card" onClick={() => setActiveTab('rvowners')}>
                            <div className="home-card-icon">🚐</div>
                            <h3>RV Owners</h3>
                            <p>Find private RV sellers from Craigslist, RVTrader, and Data Axle.</p>
                            <button className="home-card-btn">
                                Go to RV Owners →
                            </button>
                        </div>
                        <div className="home-card" onClick={() => setActiveTab('rvtechs')}>
                            <div className="home-card-icon">🔧</div>
                            <h3>RV Techs</h3>
                            <p>Find RVTI certified technicians near Fireside franchise locations.</p>
                            <button className="home-card-btn">
                                Go to RV Techs →
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'search' ? (
                <div className="search-agent-container">
                    <div className="search-card">
                        <h2>🤖 Search Agent</h2>
                        <p>Use Google Maps to find leads in specific locations.</p>

                        <form onSubmit={handleSearchAgent} className="search-form">
                            <div className="search-input-group">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="e.g. RV repair in Dallas, TX"
                                    className="search-input"
                                />
                                {searchHistory.length > 0 && (
                                    <div className="search-history">
                                        <small>Recent: </small>
                                        {searchHistory.slice(0, 3).map((h, i) => (
                                            <span key={i} onClick={() => setSearchQuery(h)} className="history-tag">
                                                {h}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input
                                type="number"
                                value={maxResults}
                                onChange={(e) => setMaxResults(parseInt(e.target.value) || 50)}
                                placeholder="Max"
                                className="search-limit"
                                min="1"
                                max="200"
                            />
                            <button type="submit" disabled={scraping} className="search-btn">
                                {scraping ? 'Searching...' : 'Start Agent'}
                            </button>
                        </form>

                        <div className="search-tips">
                            <h3>Try searching for:</h3>
                            <ul>
                                <li>"RV storage in Florida"</li>
                                <li>"U-Haul dealers in Austin"</li>
                                <li>"Mobile RV repair near me"</li>
                            </ul>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'rvtechs' ? (
                <div className="rvtechs-container">
                    <div className="rvtechs-header">
                        <h2>🔧 RVTI Certified Technicians</h2>
                        <p>Recommend these certified RV technicians to renters near Fireside locations</p>
                    </div>

                    <div className="rvtechs-filters">
                        <input
                            type="text"
                            placeholder="Search by name, city..."
                            value={rvtiFilters.search}
                            onChange={(e) => setRvtiFilters({ ...rvtiFilters, search: e.target.value })}
                            className="search-input"
                        />
                        <select
                            value={rvtiFilters.franchise}
                            onChange={(e) => setRvtiFilters({ ...rvtiFilters, franchise: e.target.value })}
                            className="filter-select"
                        >
                            <option value="">All Franchises</option>
                            {rvtiFranchises.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                        <select
                            value={rvtiFilters.state}
                            onChange={(e) => setRvtiFilters({ ...rvtiFilters, state: e.target.value })}
                            className="filter-select"
                        >
                            <option value="">All States</option>
                            <option value="TX">Texas</option>
                            <option value="FL">Florida</option>
                            <option value="CA">California</option>
                            <option value="AZ">Arizona</option>
                            <option value="CO">Colorado</option>
                            <option value="TN">Tennessee</option>
                            <option value="NC">North Carolina</option>
                            <option value="SC">South Carolina</option>
                            <option value="GA">Georgia</option>
                            <option value="AL">Alabama</option>
                            <option value="MI">Michigan</option>
                            <option value="PA">Pennsylvania</option>
                            <option value="OH">Ohio</option>
                            <option value="VA">Virginia</option>
                            <option value="WI">Wisconsin</option>
                        </select>
                        <span className="result-count">{rvtiTechs.length} techs found</span>
                    </div>

                    {rvtiLoading ? (
                        <div className="loading">Loading technicians...</div>
                    ) : rvtiTechs.length === 0 ? (
                        <div className="no-leads">No certified technicians found. Try adjusting filters.</div>
                    ) : (
                        <div className="rvtechs-table-container">
                            <table className="leads-table rvtechs-table">
                                <thead>
                                    <tr>
                                        <th>Business Name</th>
                                        <th>Location</th>
                                        <th>Phone</th>
                                        <th>Website</th>
                                        <th>Nearest Franchise</th>
                                        <th>Distance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rvtiTechs.map((tech) => (
                                        <tr key={tech._id}>
                                            <td className="tech-name">
                                                <strong>{tech.businessName}</strong>
                                                <div className="tech-badge">RVTI Certified</div>
                                            </td>
                                            <td>
                                                <div>{tech.address}</div>
                                                <div className="tech-location">{tech.city}, {tech.state} {tech.zip}</div>
                                            </td>
                                            <td>
                                                {tech.phone ? (
                                                    <a href={`tel:${tech.phone}`} className="phone-link">{tech.phone}</a>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                {tech.website ? (
                                                    <a href={tech.website} target="_blank" rel="noopener noreferrer" className="website-link">
                                                        Visit Site →
                                                    </a>
                                                ) : '-'}
                                            </td>
                                            <td className="franchise-cell">
                                                {tech.rvtiData?.nearestFranchise || '-'}
                                            </td>
                                            <td className="distance-cell">
                                                {tech.rvtiData?.distanceToFranchise ? (
                                                    <span className={`distance-badge ${tech.rvtiData.distanceToFranchise <= 25 ? 'close' : tech.rvtiData.distanceToFranchise <= 50 ? 'medium' : 'far'}`}>
                                                        {tech.rvtiData.distanceToFranchise} mi
                                                    </span>
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : activeTab === 'visitors' ? (
                <div className="visitors-container">
                    <div className="visitors-header">
                        <h2>📊 Website Visitor Tracking</h2>
                        <p>Track anonymous visitors and export for Facebook Lookalike Audiences</p>
                    </div>

                    {visitorStats && (
                        <div className="visitor-stats-grid">
                            <div className="stat-card">
                                <h3>Total Visitors</h3>
                                <p className="stat-number">{visitorStats.totalVisitors || 0}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Today</h3>
                                <p className="stat-number">{visitorStats.todayVisitors || 0}</p>
                            </div>
                            <div className="stat-card">
                                <h3>This Week</h3>
                                <p className="stat-number">{visitorStats.weekVisitors || 0}</p>
                            </div>
                            <div className="stat-card">
                                <h3>Business IPs</h3>
                                <p className="stat-number">{visitorStats.businessVisitors || 0}</p>
                            </div>
                        </div>
                    )}

                    <div className="pixel-setup-card">
                        <h3>🔌 Install Tracking Pixel</h3>
                        <p>Add this code to your website before the closing <code>&lt;/body&gt;</code> tag:</p>
                        <div className="code-block">
                            <pre>{getPixelCode()}</pre>
                            <button
                                className="copy-btn"
                                onClick={() => {
                                    navigator.clipboard.writeText(getPixelCode());
                                    alert('Copied to clipboard!');
                                }}
                            >
                                📋 Copy Code
                            </button>
                        </div>
                    </div>

                    <div className="visitors-actions">
                        <button onClick={handleExportVisitorsFacebook} className="export-btn">
                            📥 Export for Facebook
                        </button>
                        <button onClick={() => { fetchVisitors(); fetchVisitorStats(); }} className="refresh-btn">
                            🔄 Refresh
                        </button>
                    </div>

                    {visitorLoading ? (
                        <div className="loading">Loading visitors...</div>
                    ) : visitors.length === 0 ? (
                        <div className="no-leads">No visitors tracked yet. Install the pixel to start tracking!</div>
                    ) : (
                        <div className="visitors-table-container">
                            <table className="leads-table">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Company</th>
                                        <th>Device</th>
                                        <th>Pages</th>
                                        <th>First Visit</th>
                                        <th>Last Visit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visitors.map((v) => (
                                        <tr key={v._id}>
                                            <td>{v.city}, {v.state} {v.zip}</td>
                                            <td>{v.company || '-'}</td>
                                            <td>{v.device} / {v.browser}</td>
                                            <td>{v.totalPageViews}</td>
                                            <td>{new Date(v.firstVisit).toLocaleDateString()}</td>
                                            <td>{new Date(v.lastVisit).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : activeTab === 'goodleads' ? (
                <div className="goodleads-container">
                    <div className="goodleads-header">
                        <h2>⭐ Good Leads for Facebook</h2>
                        <p>Curated leads ready for Lookalike Audience export</p>
                    </div>

                    <div className="goodleads-actions">
                        <button onClick={handleExportGoodLeads} className="export-btn" disabled={goodLeads.length === 0}>
                            📥 Export Facebook CSV ({goodLeads.length} leads)
                        </button>
                        <button onClick={fetchGoodLeads} className="refresh-btn">
                            🔄 Refresh
                        </button>
                    </div>

                    {goodLeads.length === 0 ? (
                        <div className="no-leads">
                            <p>No good leads marked yet.</p>
                            <p>Go to the <strong>Leads</strong> tab and click the ⭐ button to mark leads as good for Facebook export.</p>
                        </div>
                    ) : (
                        <div className="goodleads-table-container">
                            <table className="leads-table">
                                <thead>
                                    <tr>
                                        <th>Business Name</th>
                                        <th>Owner</th>
                                        <th>Location</th>
                                        <th>Phone</th>
                                        <th>Email</th>
                                        <th>Enriched</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {goodLeads.map((lead) => (
                                        <tr key={lead._id}>
                                            <td>{lead.businessName}</td>
                                            <td>
                                                {lead.enrichedData?.ownerFirstName || lead.ownerName || '-'}
                                                {lead.enrichedData?.ownerLastName && ` ${lead.enrichedData.ownerLastName}`}
                                            </td>
                                            <td>{lead.city}, {lead.state}</td>
                                            <td>{lead.phone || '-'}</td>
                                            <td>{lead.enrichedData?.personalEmail || lead.email || '-'}</td>
                                            <td>
                                                {lead.enrichedData?.enrichedAt ? (
                                                    <span className="badge badge-success">Yes</span>
                                                ) : (
                                                    <span className="badge badge-pending">No</span>
                                                )}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleMarkGood(lead._id)}
                                                    className="icon-btn"
                                                    title="Remove from Good Leads"
                                                >
                                                    ❌
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : activeTab === 'rvowners' ? (
                <div className="search-agent-container">
                    {/* ... (keep existing RV Owner search) ... */}
                    <div className="search-card">
                        <h2>🚐 RV Owner Search</h2>
                        <p>Find RV owners from classified listings (RVTrader, Craigslist, etc.)</p>

                        <form onSubmit={handleRVOwnerSearch} className="search-form rv-form-grid">
                            <div className="form-group">
                                <label>Source</label>
                                <select
                                    value={rvSource}
                                    onChange={(e) => setRvSource(e.target.value)}
                                    className="search-input source-select"
                                >
                                    <option value="rvtrader">RVTrader</option>
                                    <option value="craigslist">Craigslist (Free)</option>
                                    <option value="dataaxle">Data Axle (Premium)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>State (Required)</label>
                                <input
                                    type="text"
                                    value={rvState}
                                    onChange={(e) => setRvState(e.target.value)}
                                    placeholder="e.g. TX"
                                    className="search-input state-input"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>City</label>
                                <input
                                    type="text"
                                    value={rvCity}
                                    onChange={(e) => setRvCity(e.target.value)}
                                    placeholder="e.g. Austin"
                                    className="search-input city-input"
                                />
                            </div>

                            {rvSource === 'rvtrader' && (
                                <div className="form-group">
                                    <label>RV Type</label>
                                    <input
                                        type="text"
                                        value={rvType}
                                        onChange={(e) => setRvType(e.target.value)}
                                        placeholder="e.g. Class A"
                                        className="search-input type-input"
                                    />
                                </div>
                            )}

                            {rvSource === 'dataaxle' && (
                                <div className="form-group">
                                    <label>ZIP Code</label>
                                    <input
                                        type="text"
                                        value={rvZip}
                                        onChange={(e) => setRvZip(e.target.value)}
                                        placeholder="e.g. 78701"
                                        className="search-input zip-input"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label>Max Results</label>
                                <input
                                    type="number"
                                    value={maxResults}
                                    onChange={(e) => setMaxResults(parseInt(e.target.value) || 50)}
                                    placeholder="50"
                                    className="search-limit"
                                    min="1"
                                    max="200"
                                />
                            </div>

                            <div className="form-actions">
                                <button type="submit" disabled={scraping} className="search-btn full-width">
                                    {scraping ? 'Searching...' : 'Find RV Owners'}
                                </button>
                            </div>
                        </form>

                        <div className="search-tips compact">
                            <small>
                                <strong>Tips:</strong> State is required. City narrows results. Scrapes private sellers only.
                            </small>
                        </div>
                    </div>

                    {/* RV Owner Leads Display */}
                    <div className="rv-leads-container">
                        {loading ? (
                            <p>Loading...</p>
                        ) : Object.entries(groupedLeads)
                            .filter(([source]) => source.includes('RVTrader') || source.includes('Craigslist'))
                            .length === 0 ? (
                            <div className="no-leads">No RV owner leads found yet. Try a search above!</div>
                        ) : (
                            Object.entries(groupedLeads)
                                .filter(([source]) => source.includes('RVTrader') || source.includes('Craigslist'))
                                .map(([source, groupLeads]) => (
                                    <div key={source} className="lead-group">
                                        <div className="group-header" onClick={() => toggleGroup(source)}>
                                            <div className="group-title">
                                                <span className="toggle-icon">{expandedGroups.has(source) ? '▼' : '▶'}</span>
                                                <h3>{source} ({groupLeads.length})</h3>
                                            </div>
                                            <div className="group-actions" onClick={e => e.stopPropagation()}>
                                                <button
                                                    className="export-csv-btn"
                                                    onClick={() => handleExportCSV(groupLeads, source.replace(/[^a-z0-9]/gi, '_').toLowerCase())}
                                                    title="Download CSV"
                                                >
                                                    📥 CSV
                                                </button>
                                                <button
                                                    className="select-all-btn"
                                                    onClick={() => toggleSelectAll(groupLeads)}
                                                >
                                                    {groupLeads.every(l => selectedLeads.has(l._id)) ? 'Deselect All' : 'Select All'}
                                                </button>
                                            </div>
                                        </div>

                                        {expandedGroups.has(source) && (
                                            <div className="group-content">
                                                <table className="leads-table">
                                                    <thead>
                                                        <tr>
                                                            <th style={{ width: '40px' }}></th>
                                                            <th>Owner Name</th>
                                                            <th>RV Details</th>
                                                            <th>Location</th>
                                                            <th>Phone</th>
                                                            <th>Email</th>
                                                            <th>Price</th>
                                                            <th>Status</th>
                                                            <th>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {groupLeads.map((lead) => (
                                                            <tr key={lead._id} className={selectedLeads.has(lead._id) ? 'selected' : ''}>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedLeads.has(lead._id)}
                                                                        onChange={() => toggleSelectOne(lead._id)}
                                                                    />
                                                                </td>
                                                                <td>{lead.ownerName || lead.businessName}</td>
                                                                <td>
                                                                    {lead.rvDetails ? (
                                                                        <div className="rv-details-cell">
                                                                            <strong>
                                                                                {lead.rvDetails.year && `${lead.rvDetails.year} `}
                                                                                {lead.rvDetails.make && `${lead.rvDetails.make} `}
                                                                                {lead.rvDetails.model || lead.rvDetails.rvType || 'RV'}
                                                                            </strong>
                                                                            {lead.rvDetails.rvType && (
                                                                                <div style={{ fontSize: '0.85em', color: '#666' }}>
                                                                                    Type: {lead.rvDetails.rvType}
                                                                                </div>
                                                                            )}
                                                                            {lead.rvDetails.listingUrl && (
                                                                                <a
                                                                                    href={lead.rvDetails.listingUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="listing-link"
                                                                                >
                                                                                    View Listing →
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        lead.businessName
                                                                    )}
                                                                </td>
                                                                <td>{lead.city}, {lead.state}</td>
                                                                <td>{lead.phone || '-'}</td>
                                                                <td>{lead.email || '-'}</td>
                                                                <td>{lead.rvDetails?.price ? `$${lead.rvDetails.price.toLocaleString()}` : '-'}</td>
                                                                <td><span className={`status status-${lead.status.toLowerCase()}`}>{lead.status}</span></td>
                                                                <td className="row-actions">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExportClick(lead); }}
                                                                        className="icon-btn ghl-icon-btn"
                                                                        title="Export to GHL"
                                                                    >
                                                                        📤
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(lead._id); }}
                                                                        className="icon-btn delete-icon-btn"
                                                                        title="Delete"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            ) : (
                <div className="controls">
                    <div className="filters">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                        <select
                            value={filters.state}
                            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                        >
                            <option value="">All States</option>
                            <option value="TX">Texas</option>
                            <option value="CA">California</option>
                            <option value="FL">Florida</option>
                            <option value="NY">New York</option>
                        </select>
                        <select
                            value={filters.type}
                            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                        >
                            <option value="">All Types</option>
                            <option value="RV Tech">RV Tech</option>
                            <option value="U-Haul">U-Haul</option>
                        </select>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All Status</option>
                            <option value="New">New</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Interested">Interested</option>
                        </select>
                    </div>

                    <div className="actions">
                        {selectedLeads.size > 0 && (
                            <>
                                <button onClick={handleEnrichSelected} className="enrich-btn">
                                    🔍 Enrich ({selectedLeads.size})
                                </button>
                                <button onClick={handleBulkDeleteClick} className="delete-btn">
                                    Delete ({selectedLeads.size})
                                </button>
                                <button onClick={() => setModal({ show: true, type: 'export', data: null })} className="ghl-btn">
                                    Export to GHL ({selectedLeads.size})
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'leads' && (
                <div className="leads-container">
                    {loading ? (
                        <p>Loading...</p>
                    ) : Object.keys(groupedLeads).length === 0 ? (
                        <div className="no-leads">No leads found. Try using the Search Agent!</div>
                    ) : (
                        Object.entries(groupedLeads).map(([source, groupLeads]) => (
                            <div key={source} className="lead-group">
                                <div className="group-header" onClick={() => toggleGroup(source)}>
                                    <div className="group-title">
                                        <span className="toggle-icon">{expandedGroups.has(source) ? '▼' : '▶'}</span>
                                        <h3>{source} ({groupLeads.length})</h3>
                                    </div>
                                    <div className="group-actions" onClick={e => e.stopPropagation()}>
                                        {source.startsWith("Google Maps Search: ") && (
                                            <button
                                                className="continue-search-btn"
                                                onClick={(e) => { e.stopPropagation(); handleContinueSearch(source); }}
                                                title="Search for more leads with this query"
                                                type="button"
                                            >
                                                🔄 Continue Search
                                            </button>
                                        )}
                                        <button
                                            className="export-csv-btn"
                                            onClick={() => handleExportCSV(groupLeads, source.replace(/[^a-z0-9]/gi, '_').toLowerCase())}
                                            title="Download CSV"
                                        >
                                            📥 CSV
                                        </button>
                                        <button
                                            className="select-all-btn"
                                            onClick={() => toggleSelectAll(groupLeads)}
                                        >
                                            {groupLeads.every(l => selectedLeads.has(l._id)) ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                </div>

                                {expandedGroups.has(source) && (
                                    <div className="group-content">
                                        <table className="leads-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '40px' }}></th>
                                                    <th>Business Name</th>
                                                    <th>Type</th>
                                                    <th>City</th>
                                                    <th>State</th>
                                                    <th>Phone</th>
                                                    <th>Email</th>
                                                    <th>Status</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupLeads.map((lead) => (
                                                    <tr key={lead._id} className={selectedLeads.has(lead._id) ? 'selected' : ''}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedLeads.has(lead._id)}
                                                                onChange={() => toggleSelectOne(lead._id)}
                                                            />
                                                        </td>
                                                        <td>{lead.businessName}</td>
                                                        <td><span className={`badge badge-${lead.type.toLowerCase().replace(' ', '-')}`}>{lead.type}</span></td>
                                                        <td>{lead.city}</td>
                                                        <td>{lead.state}</td>
                                                        <td>{lead.phone || '-'}</td>
                                                        <td>{lead.email || '-'}</td>
                                                        <td><span className={`status status-${lead.status.toLowerCase()}`}>{lead.status}</span></td>
                                                        <td className="row-actions">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleMarkGood(lead._id); }}
                                                                className={`icon-btn ${lead.isGoodLead ? 'active' : ''}`}
                                                                title={lead.isGoodLead ? 'Remove from Good Leads' : 'Mark as Good Lead'}
                                                            >
                                                                {lead.isGoodLead ? '⭐' : '☆'}
                                                            </button>
                                                            {lead.website && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleEnrichLead(lead._id); }}
                                                                    className="icon-btn"
                                                                    title={lead.enrichedData?.enrichedAt ? 'Already Enriched' : 'Enrich with AI'}
                                                                    disabled={enriching.has(lead._id) || lead.enrichedData?.enrichedAt}
                                                                >
                                                                    {enriching.has(lead._id) ? '⏳' : lead.enrichedData?.enrichedAt ? '✅' : '🔍'}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleExportClick(lead); }}
                                                                className="icon-btn ghl-icon-btn"
                                                                title="Export to GHL"
                                                            >
                                                                📤
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(lead._id); }}
                                                                className="icon-btn delete-icon-btn"
                                                                title="Delete"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

