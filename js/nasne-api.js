/**
 * nasne API Client
 * Provides methods to interact with nasne's HTTP JSON API.
 */
class NasneClient {
    /**
     * @param {string} ip - nasne IP address (e.g. '192.168.1.100')
     */
    constructor(ip) {
        this.ip = ip;
        this.ports = {
            status: 64210,
            schedule: 64220,
            recorded: 64220,
            chEpg: 64220,
        };
    }

    /**
     * Determine port from the API path.
     * @param {string} pathname - e.g. '/status/channelListGet'
     * @returns {number}
     */
    _getPort(pathname) {
        const segment = pathname.split('/')[1];
        return this.ports[segment] || 64210;
    }

    /**
     * Build URL with query parameters.
     * @param {string} pathname
     * @param {Object} [params]
     * @returns {string}
     */
    _buildUrl(pathname, params) {
        const port = this._getPort(pathname);
        const url = new URL(`http://${this.ip}:${port}${pathname}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    url.searchParams.set(key, String(value));
                }
            });
        }
        return url.toString();
    }

    /**
     * Make a GET request to nasne API.
     * @param {string} pathname
     * @param {Object} [params]
     * @returns {Promise<Object>}
     */
    async _get(pathname, params) {
        const url = this._buildUrl(pathname, params);
        console.log('[nasne] GET', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`nasne API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    // ─── Status ────────────────────────────────────────────

    /**
     * Get list of channels.
     * @param {number} broadcastingType - 2=地デジ, 3=BS, 4=CS
     * @returns {Promise<Object>}
     */
    async getChannelList(broadcastingType) {
        return this._get('/status/channelListGet', { broadcastingType });
    }

    /**
     * Get detailed channel info (currently broadcasting program).
     * @param {Object} tuningInfo
     * @param {number} tuningInfo.serviceId
     * @param {number} tuningInfo.transportStreamId
     * @param {number} tuningInfo.networkId
     * @param {Object} [options]
     * @returns {Promise<Object>}
     */
    async getChannelInfo2(tuningInfo, options) {
        return this._get('/status/channelInfoGet2', {
            serviceId: tuningInfo.serviceId,
            transportStreamId: tuningInfo.transportStreamId,
            networkId: tuningInfo.networkId,
            withDescriptionLong: 1,
            ...options,
        });
    }

    /**
     * Get box status list (device info).
     * @returns {Promise<Object>}
     */
    async getBoxStatusList() {
        return this._get('/status/boxStatusListGet');
    }

    // ─── Schedule ──────────────────────────────────────────

    /**
     * Get list of recording reservations.
     * @param {Object} [options]
     * @returns {Promise<Object>}
     */
    async getReservedList(options) {
        return this._get('/schedule/reservedListGet', {
            searchCriteria: 0,
            filter: 0,
            startingIndex: 0,
            requestedCount: 0,
            sortCriteria: 0,
            withDescriptionLong: 1,
            withUserData: 0,
            ...options,
        });
    }

    /**
     * Create a recording reservation.
     * @param {Object} params
     * @param {string} params.title
     * @param {string} params.startDateTime - ISO 8601 format
     * @param {number} params.duration - seconds
     * @param {number} params.serviceId - channel ID
     * @param {number} params.broadcastingType - 2=地デジ, 3=BS, 4=CS
     * @param {number} [params.eventId] - EPG event ID (auto-fills title/time)
     * @param {string} [params.conditionId] - '1'=once, 'd'=daily, 'w3'=weekly
     * @param {number} [params.quality] - 100=DR, 101=3x
     * @returns {Promise<Object>}
     */
    async createReservation(params) {
        const queryParams = {
            title: params.title || '',
            startDateTime: params.startDateTime,
            duration: params.duration,
            serviceId: params.serviceId,
            broadcastingType: params.broadcastingType,
            conditionId: params.conditionId || '1',
            quality: params.quality || 100,
        };
        if (params.eventId) {
            queryParams.eventId = params.eventId;
        }
        return this._get('/schedule/reservedInfoCreate', queryParams);
    }

    /**
     * Delete a recording reservation.
     * @param {number} id - reservation ID
     * @param {number} type - reservation type
     * @returns {Promise<Object>}
     */
    async deleteReservation(id, type) {
        return this._get('/schedule/reservedInfoDelete', { id, type });
    }

    /**
     * Check for scheduling conflicts.
     * @param {Object} params
     * @param {string} params.startDateTime
     * @param {number} params.duration
     * @param {number} params.broadcastingType
     * @param {number} params.serviceId
     * @returns {Promise<Object>}
     */
    async getConflictList(params) {
        return this._get('/schedule/conflictListGet', params);
    }

    // ─── Recorded ──────────────────────────────────────────

    /**
     * Get list of recorded titles.
     * @param {Object} [options]
     * @returns {Promise<Object>}
     */
    async getRecordedTitleList(options) {
        return this._get('/recorded/titleListGet', {
            searchCriteria: 0,
            filter: 0,
            startingIndex: 0,
            requestedCount: 0,
            sortCriteria: 0,
            withDescriptionLong: 1,
            withUserData: 0,
            ...options,
        });
    }

    /**
     * Delete a recorded title.
     * @param {string} id - recorded title ID
     * @returns {Promise<Object>}
     */
    async deleteRecordedTitle(id) {
        return this._get('/recorded/titleDelete', { id });
    }

    // ─── Helpers ───────────────────────────────────────────

    /**
     * Test connection to nasne.
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        try {
            await this.getBoxStatusList();
            return true;
        } catch (e) {
            console.error('[nasne] Connection failed:', e);
            return false;
        }
    }
}

// Broadcasting type constants
NasneClient.BroadcastingType = {
    DTTV: 2, // 地デジ
    BS: 3,
    CS: 4,
};

// Recording quality constants
NasneClient.Quality = {
    DR: 100,
    THREE_X: 101,
};
