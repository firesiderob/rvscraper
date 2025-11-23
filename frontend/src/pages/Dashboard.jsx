// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { getLeads, deleteLead, getLeadStats, scrapeUHaul, scrapeRVTech, searchAgent, scrapeRVTrader, scrapeCraigslist, searchDataAxle } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

export default function Dashboard() {
    const [leads, setLeads] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ state: '', type: '', status: '', search: '' });
    const [scraping, setScraping] = useState(false);
    const [activeTab, setActiveTab] = useState('leads'); // 'leads', 'search', or 'rvowners'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const { logout } = useAuth();
    const [modal, setModal] = useState({ show: false, type: '', data: null });
    const [ghlUrl, setGhlUrl] = useState('');
    const [maxResults, setMaxResults] = useState(50); // Default to 50

    // RV Owner search state
    const [rvSource, setRvSource] = useState('rvtrader'); // 'rvtrader', 'craigslist', or 'dataaxle'
    const [rvZip, setRvZip] = useState(''); // For Data Axle ZIP targeting
    const [rvState, setRvState] = useState('');
    const [rvCity, setRvCity] = useState('');
    const [rvType, setRvType] = useState('');

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

            {activeTab === 'search' ? (
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
            ) : activeTab === 'rvowners' ? (
                <div className="search-agent-container">
                    {/* ... (keep existing RV Owner search) ... */}
                    <div className="search-card">
                        <h2>🚐 RV Owner Search</h2>
                        <p>Find RV owners from classified listings (RVTrader, Craigslist, etc.)</p>

                        <form onSubmit={handleRVOwnerSearch} className="search-form rv-form">
                            <select
                                value={rvSource}
                                onChange={(e) => setRvSource(e.target.value)}
                                className="search-input source-select"
                            >
                                <option value="rvtrader">RVTrader</option>
                                <option value="craigslist">Craigslist (Free)</option>
                                <option value="dataaxle">Data Axle (Premium)</option>
                            </select>
                            <input
                                type="text"
                                value={rvState}
                                onChange={(e) => setRvState(e.target.value)}
                                placeholder="State (e.g., TX, CA, FL)"
                                className="search-input state-input"
                                required
                            />
                            <input
                                type="text"
                                value={rvCity}
                                onChange={(e) => setRvCity(e.target.value)}
                                placeholder="City (optional)"
                                className="search-input city-input"
                            />
                            {rvSource === 'rvtrader' && (
                                <input
                                    type="text"
                                    value={rvType}
                                    onChange={(e) => setRvType(e.target.value)}
                                    placeholder="RV Type (optional)"
                                    className="search-input type-input"
                                />
                            )}
                            {rvSource === 'dataaxle' && (
                                <input
                                    type="text"
                                    value={rvZip}
                                    onChange={(e) => setRvZip(e.target.value)}
                                    placeholder="ZIP Code (optional)"
                                    className="search-input zip-input"
                                />
                            )}
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
                                {scraping ? 'Searching...' : 'Find RV Owners'}
                            </button>
                        </form>

                        <div className="search-tips">
                            <h3>Tips:</h3>
                            <ul>
                                <li><strong>State</strong> is required (2-letter code)</li>
                                <li><strong>City</strong> narrows results to a specific area</li>
                                <li><strong>RV Type</strong>: Class A, Class B, Travel Trailer, Fifth Wheel, etc.</li>
                                <li>Scrapes <strong>private sellers only</strong> (not dealers)</li>
                            </ul>
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
                                <button onClick={handleBulkDeleteClick} className="delete-btn">
                                    Delete ({selectedLeads.size})
                                </button>
                                <button onClick={() => setModal({ show: true, type: 'export', data: null })} className="ghl-btn">
                                    Export to GHL ({selectedLeads.size})
                                </button>
                            </>
                        )}
                        {/* Removed Scrape U-Haul and Scrape RV Techs buttons as requested */}
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

