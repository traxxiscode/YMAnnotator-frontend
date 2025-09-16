/**
 * Geotab Yard Move Zones Add-in
 * @returns {{initialize: Function, focus: Function, blur: Function}}
 */
geotab.addin.yardMoveZones = function () {
    'use strict';

    let api;
    let state;
    let elAddin;
    
    // Global variables for zone management
    let yardMoveTypeId = null;
    let regularZones = [];
    let yardMoveZones = [];
    let filteredRegularZones = [];
    let filteredYardMoveZones = [];

    /**
     * Make a Geotab API call
     */
    async function makeGeotabCall(method, typeName, parameters = {}) {
        if (!api) {
            throw new Error('Geotab API not initialized');
        }
        
        return new Promise((resolve, reject) => {
            const callParams = {
                typeName: typeName,
                ...parameters
            };
            
            api.call(method, callParams, resolve, reject);
        });
    }

    /**
     * Add current database to Firestore if it doesn't exist
     */
    async function ensureDatabaseInFirestore() {
        if (!api || !window.db) {
            return;
        }
        
        try {
            api.getSession(async function(session) {
                const databaseName = session.database;
                
                if (databaseName && databaseName !== 'demo') {
                    // Check if database already exists
                    const querySnapshot = await window.db.collection('geotab_databases')
                        .where('database_name', '==', databaseName)
                        .get();
                    
                    if (querySnapshot.empty) {
                        // Add new database
                        await window.db.collection('geotab_databases').add({
                            database_name: databaseName,
                            added_at: firebase.firestore.FieldValue.serverTimestamp(),
                            active: true
                        });
                        console.log(`Added database ${databaseName} to Firestore`);
                    } else {
                        console.log(`Database ${databaseName} already exists in Firestore`);
                    }
                }
            });
        } catch (error) {
            console.error('Error ensuring database in Firestore:', error);
        }
    }

    /**
     * Load zones from Geotab API
     */
    async function loadZones() {
        if (!api) {
            showAlert('Geotab API not initialized. Please refresh the page.', 'danger');
            return;
        }
        
        try {
            showAlert('Loading zones and checking zone types...', 'info');
            
            // First, update the .env file with current database info
            //await updateEnvFile();
            
            // Get zone types first
            const zoneTypes = await makeGeotabCall("Get", "ZoneType");
            
            // Check if "Yard Move Zones" type exists
            yardMoveTypeId = null;
            for (const zoneType of zoneTypes) {
                if (zoneType.name === "Yard Move Zones") {
                    yardMoveTypeId = zoneType.id;
                    break;
                }
            }
            
            // If "Yard Move Zones" type doesn't exist, create it
            if (!yardMoveTypeId) {
                showAlert('Creating "Yard Move Zones" zone type...', 'info');
                try {
                    const newZoneType = {
                        name: "Yard Move Zones",
                        id: null,
                        version: null
                    };
                    
                    const result = await makeGeotabCall("Add", "ZoneType", { entity: newZoneType });
                    yardMoveTypeId = result;
                    showAlert('Successfully created "Yard Move Zones" zone type', 'success');
                } catch (error) {
                    console.error('Error creating zone type:', error);
                    showAlert('Error creating "Yard Move Zones" zone type: ' + error.message, 'danger');
                    return;
                }
            }
            
            // Now get all zones
            const zones = await makeGeotabCall("Get", "Zone");
            
            // Categorize zones
            regularZones = [];
            yardMoveZones = [];
            
            for (const zone of zones) {
                const zoneHasYardMoveType = zone.zoneTypes && zone.zoneTypes.some(zt => zt.id === yardMoveTypeId);
                
                const zoneData = {
                    id: zone.id,
                    name: zone.name || 'Unnamed Zone',
                    zoneTypes: zone.zoneTypes || [],
                    points: zone.points || [],
                    version: zone.version
                };
                
                if (zoneHasYardMoveType) {
                    yardMoveZones.push(zoneData);
                } else {
                    regularZones.push(zoneData);
                }
            }
            
            // Initialize filtered arrays
            filteredRegularZones = [...regularZones];
            filteredYardMoveZones = [...yardMoveZones];
            
            renderZones();
            showAlert(`Loaded ${regularZones.length + yardMoveZones.length} zones successfully`, 'success');
            
        } catch (error) {
            console.error('Error loading zones:', error);
            showAlert('Error loading zones: ' + error.message, 'danger');
            showEmptyState('regularZonesList');
            showEmptyState('yardMoveZonesList');
        }
    }

    /**
     * Add Yard Move Zones type to a zone
     */
    async function addYardMoveType(zoneId) {
        if (!api || !yardMoveTypeId) {
            throw new Error('API not initialized or Yard Move type not found');
        }
        
        // Get the current zone data
        const zones = await makeGeotabCall("Get", "Zone", { search: { id: zoneId } });
        if (!zones || zones.length === 0) {
            throw new Error('Zone not found');
        }
        
        const zone = zones[0];
        
        // Check if the zone already has the yard move type
        const existingZoneTypes = zone.zoneTypes || [];
        const hasYardMoveType = existingZoneTypes.some(zt => zt.id === yardMoveTypeId);
        
        if (hasYardMoveType) {
            throw new Error('Zone already has Yard Move Zones type');
        }
        
        // Add the yard move type to the zone
        const updatedZoneTypes = [...existingZoneTypes, { id: yardMoveTypeId }];
        
        // Prepare the updated zone entity
        const updatedZone = {
            id: zone.id,
            name: zone.name,
            zoneTypes: updatedZoneTypes,
            points: zone.points || [],
            version: zone.version
        };
        
        // Update the zone using Set method
        const result = await makeGeotabCall("Set", "Zone", { entity: updatedZone });
        return result;
    }

    /**
     * Remove Yard Move Zones type from a zone
     */
    async function removeYardMoveType(zoneId) {
        if (!api || !yardMoveTypeId) {
            throw new Error('API not initialized or Yard Move type not found');
        }
        
        // Get the current zone data
        const zones = await makeGeotabCall("Get", "Zone", { search: { id: zoneId } });
        if (!zones || zones.length === 0) {
            throw new Error('Zone not found');
        }
        
        const zone = zones[0];
        
        // Remove the yard move type from the zone
        const existingZoneTypes = zone.zoneTypes || [];
        const updatedZoneTypes = existingZoneTypes.filter(zt => zt.id !== yardMoveTypeId);
        
        // Prepare the updated zone entity
        const updatedZone = {
            id: zone.id,
            name: zone.name,
            zoneTypes: updatedZoneTypes,
            points: zone.points || [],
            version: zone.version
        };
        
        // Update the zone using Set method
        const result = await makeGeotabCall("Set", "Zone", { entity: updatedZone });
        return result;
    }

    /**
     * Open the create zone page in Geotab
     */
    function openCreateZone() {
        if (!api) {
            showAlert('Geotab API not initialized', 'danger');
            return;
        }
        
        // Get database name from the API session
        api.getSession(function(session) {
            const database = session.database || 'demo';
            const createZoneUrl = `https://my.geotab.com/${database}/#map,createNewZone:!t,drivers:all`;
            window.open(createZoneUrl, '_blank');
        });
    }

    /**
     * Show alert messages
     */
    function showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;
        
        const alertId = 'alert-' + Date.now();
        
        const iconMap = {
            'success': 'check-circle',
            'danger': 'exclamation-triangle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
                <i class="fas fa-${iconMap[type]} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        alertContainer.insertAdjacentHTML('beforeend', alertHtml);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert && typeof bootstrap !== 'undefined' && bootstrap.Alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 3000);
    }

    /**
     * Render zones in the UI
     */
    function renderZones() {
        renderZoneList('regularZonesList', filteredRegularZones, 'regular');
        renderZoneList('yardMoveZonesList', filteredYardMoveZones, 'yardmove');
        updateCounts();
    }

    /**
     * Filter zones based on search input
     */
    function filterZones(type) {
        const searchTerm = document.getElementById(type === 'regular' ? 'regularSearch' : 'yardMoveSearch').value.toLowerCase();
        
        if (type === 'regular') {
            filteredRegularZones = regularZones.filter(zone => 
                zone.name.toLowerCase().includes(searchTerm) || 
                zone.id.toLowerCase().includes(searchTerm)
            );
            renderZoneList('regularZonesList', filteredRegularZones, 'regular');
        } else {
            filteredYardMoveZones = yardMoveZones.filter(zone => 
                zone.name.toLowerCase().includes(searchTerm) || 
                zone.id.toLowerCase().includes(searchTerm)
            );
            renderZoneList('yardMoveZonesList', filteredYardMoveZones, 'yardmove');
        }
        
        updateCounts();
    }

    /**
     * Render a list of zones
     */
    function renderZoneList(containerId, zones, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (zones.length === 0) {
            showEmptyState(containerId);
            return;
        }
        
        const zonesHtml = zones.map(zone => `
            <div class="zone-item ${type === 'yardmove' ? 'yard-move-zone' : ''}" 
                 draggable="true" 
                 ondragstart="drag(event)" 
                 data-zone-id="${zone.id}"
                 data-zone-name="${zone.name}"
                 data-current-type="${type}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${zone.name}</strong>
                        <small class="d-block opacity-75">ID: ${zone.id}</small>
                    </div>
                    <i class="fas fa-grip-vertical"></i>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = zonesHtml;
    }

    /**
     * Show empty state message
     */
    function showEmptyState(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const type = containerId.includes('regular') ? 'regular' : 'yard move';
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No ${type} zones available</p>
                <small>Drag zones here to ${type === 'regular' ? 'remove from' : 'add to'} Yard Move Zones</small>
            </div>
        `;
    }

    /**
     * Update zone counts
     */
    function updateCounts() {
        const regularCountEl = document.getElementById('regularCount');
        const yardMoveCountEl = document.getElementById('yardMoveCount');
        
        if (regularCountEl) {
            regularCountEl.textContent = `${filteredRegularZones.length} of ${regularZones.length} zones`;
        }
        if (yardMoveCountEl) {
            yardMoveCountEl.textContent = `${filteredYardMoveZones.length} of ${yardMoveZones.length} zones`;
        }
    }

    /**
     * Handle drag start
     */
    window.drag = function(event) {
        const zoneId = event.target.dataset.zoneId;
        const zoneName = event.target.dataset.zoneName;
        const currentType = event.target.dataset.currentType;
        
        event.dataTransfer.setData('text/plain', JSON.stringify({
            zoneId: zoneId,
            zoneName: zoneName,
            currentType: currentType
        }));
    };

    /**
     * Allow drop
     */
    window.allowDrop = function(event) {
        event.preventDefault();
    };

    /**
     * Handle drag enter
     */
    window.dragEnter = function(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    };

    /**
     * Handle drag leave
     */
    window.dragLeave = function(event) {
        // Only remove the class if we're leaving the container itself, not a child
        if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.classList.remove('drag-over');
        }
    };

    /**
     * Handle drop
     */
    window.drop = async function(event, targetType) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        const { zoneId, zoneName, currentType } = data;
        
        // Don't do anything if dropping in the same container
        if (currentType === targetType) {
            return;
        }
        
        try {
            let action, actionText;
            
            if (targetType === 'yardmove') {
                action = 'add';
                actionText = 'Adding';
            } else {
                action = 'remove';
                actionText = 'Removing';
            }
            
            showAlert(`${actionText} "${zoneName}" ${action === 'add' ? 'to' : 'from'} Yard Move Zones...`, 'info');
            
            if (action === 'add') {
                await addYardMoveType(zoneId);
            } else {
                await removeYardMoveType(zoneId);
            }
            
            // Move zone between arrays
            if (targetType === 'yardmove') {
                const zoneIndex = regularZones.findIndex(z => z.id === zoneId);
                if (zoneIndex !== -1) {
                    const zone = regularZones.splice(zoneIndex, 1)[0];
                    // Update the zone's zoneTypes to include the yard move type
                    zone.zoneTypes = [...(zone.zoneTypes || []), { id: yardMoveTypeId }];
                    yardMoveZones.push(zone);
                }
            } else {
                const zoneIndex = yardMoveZones.findIndex(z => z.id === zoneId);
                if (zoneIndex !== -1) {
                    const zone = yardMoveZones.splice(zoneIndex, 1)[0];
                    // Remove yard move type from zone's zoneTypes
                    zone.zoneTypes = (zone.zoneTypes || []).filter(zt => zt.id !== yardMoveTypeId);
                    regularZones.push(zone);
                }
            }
            
            // Update filtered arrays and re-render
            filteredRegularZones = [...regularZones];
            filteredYardMoveZones = [...yardMoveZones];
            
            // Clear search boxes to show all zones
            const regularSearch = document.getElementById('regularSearch');
            const yardMoveSearch = document.getElementById('yardMoveSearch');
            if (regularSearch) regularSearch.value = '';
            if (yardMoveSearch) yardMoveSearch.value = '';
            
            renderZones();
            showAlert(`Successfully ${action === 'add' ? 'added' : 'removed'} "${zoneName}" ${action === 'add' ? 'to' : 'from'} Yard Move Zones`, 'success');
            
        } catch (error) {
            console.error('Error updating zone:', error);
            showAlert('Error updating zone: ' + error.message, 'danger');
        }
    };

    /**
     * Clear search input and reset filtered zones
     */
    window.clearSearch = function(type) {
        const searchInput = document.getElementById(type === 'regular' ? 'regularSearch' : 'yardMoveSearch');
        if (searchInput) {
            searchInput.value = '';
            filterZones(type);
        }
    };

    /**
     * Refresh zones data
     */
    window.refreshZones = async function() {
        await loadZones();
    };

    /**
     * Export zones data as JSON
     */
    window.exportZones = function() {
        const data = {
            timestamp: new Date().toISOString(),
            yardMoveTypeId: yardMoveTypeId,
            regularZones: regularZones,
            yardMoveZones: yardMoveZones,
            stats: {
                totalZones: regularZones.length + yardMoveZones.length,
                regularZones: regularZones.length,
                yardMoveZones: yardMoveZones.length,
                filteredRegular: filteredRegularZones.length,
                filteredYardMove: filteredYardMoveZones.length
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zones-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAlert('Zones data exported successfully', 'success');
    };

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Add debounced search functionality
        let searchTimeout;
        
        function debounceSearch(type) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterZones(type);
            }, 300);
        }
        
        // Add event listeners for search inputs
        const regularSearch = document.getElementById('regularSearch');
        const yardMoveSearch = document.getElementById('yardMoveSearch');
        
        if (regularSearch) {
            regularSearch.addEventListener('input', () => debounceSearch('regular'));
        }
        
        if (yardMoveSearch) {
            yardMoveSearch.addEventListener('input', () => debounceSearch('yardmove'));
        }

        // Handle keyboard shortcuts
        document.addEventListener('keydown', function(event) {
            // Ctrl/Cmd + R to refresh zones
            if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                event.preventDefault();
                loadZones();
            }
            
            // Escape to clear search boxes
            if (event.key === 'Escape') {
                if (regularSearch && regularSearch.value) {
                    window.clearSearch('regular');
                }
                if (yardMoveSearch && yardMoveSearch.value) {
                    window.clearSearch('yardmove');
                }
            }
        });
    }

    return {
        /**
         * initialize() is called only once when the Add-In is first loaded. Use this function to initialize the
         * Add-In's state such as default values or make API requests (MyGeotab or external) to ensure interface
         * is ready for the user.
         * @param {object} freshApi - The GeotabApi object for making calls to MyGeotab.
         * @param {object} freshState - The page state object allows access to URL, page navigation and global group filter.
         * @param {function} initializeCallback - Call this when your initialize route is complete. Since your initialize routine
         *        might be doing asynchronous operations, you must call this method when the Add-In is ready
         *        for display to the user.
         */
        initialize: function (freshApi, freshState, initializeCallback) {
            api = freshApi;
            state = freshState;

            elAddin = document.getElementById('yardMoveZones');

            if (state.translate) {
                state.translate(elAddin || '');
            }
            
            initializeCallback();
        },

        /**
         * focus() is called whenever the Add-In receives focus.
         *
         * The first time the user clicks on the Add-In menu, initialize() will be called and when completed, focus().
         * focus() will be called again when the Add-In is revisited. Note that focus() will also be called whenever
         * the global state of the MyGeotab application changes, for example, if the user changes the global group
         * filter in the UI.
         *
         * @param {object} freshApi - The GeotabApi object for making calls to MyGeotab.
         * @param {object} freshState - The page state object allows access to URL, page navigation and global group filter.
         */
        focus: function (freshApi, freshState) {
            api = freshApi;
            state = freshState;

            // Ensure current database is in Firestore
            ensureDatabaseInFirestore();

            // Setup event listeners
            setupEventListeners();
            
            // Load zones data
            loadZones();
            
            // Show main content
            if (elAddin) {
                elAddin.style.display = 'block';
            }

            // Make functions globally accessible
            window.filterZones = filterZones;
            window.openCreateZone = openCreateZone;
            window.loadZones = loadZones;
        },

        /**
         * blur() is called whenever the user navigates away from the Add-In.
         *
         * Use this function to save the page state or commit changes to a data store or release memory.
         *
         * @param {object} freshApi - The GeotabApi object for making calls to MyGeotab.
         * @param {object} freshState - The page state object allows access to URL, page navigation and global group filter.
         */
        blur: function () {
            // Hide main content
            if (elAddin) {
                elAddin.style.display = 'none';
            }
        }
    };
};