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

    // ─── DLNA ContentDirectory ─────────────────────────────

    /**
     * Discover the nasne DLNA port by scanning known ports for a UPnP device description.
     * @returns {Promise<number|null>} The DLNA port, or null if not found
     */
    async discoverDlnaPort() {
        const knownPorts = [58888, 60888, 55888, 50888, 2869, 8200];
        for (const port of knownPorts) {
            try {
                const url = `http://${this.ip}:${port}/description.xml`;
                console.log(`[nasne] Trying DLNA port ${port}...`);
                const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    const text = await response.text();
                    if (text.includes('ContentDirectory') || text.includes('MediaServer')) {
                        console.log(`[nasne] DLNA port found: ${port}`);
                        this._dlnaPort = port;
                        this._dlnaDescriptionXml = text;
                        return port;
                    }
                }
            } catch (e) {
                // Port not available, try next
            }
        }

        // Also try common device description paths on each port
        for (const port of knownPorts) {
            const paths = ['/MediaServer.xml', '/rootDesc.xml', '/dmr.xml'];
            for (const path of paths) {
                try {
                    const url = `http://${this.ip}:${port}${path}`;
                    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
                    if (response.ok) {
                        const text = await response.text();
                        if (text.includes('ContentDirectory') || text.includes('MediaServer')) {
                            console.log(`[nasne] DLNA found at ${port}${path}`);
                            this._dlnaPort = port;
                            this._dlnaDescriptionXml = text;
                            return port;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }
        }

        console.warn('[nasne] DLNA port not found');
        return null;
    }

    /**
     * Parse the device description XML to find the ContentDirectory control URL.
     * @returns {string|null} The full control URL
     */
    _getDlnaControlUrl() {
        if (!this._dlnaDescriptionXml || !this._dlnaPort) return null;

        const xml = this._dlnaDescriptionXml;
        // Look for ContentDirectory service and extract controlURL
        const cdMatch = xml.match(
            /ContentDirectory[\s\S]*?<controlURL>([^<]+)<\/controlURL>/
        );
        if (cdMatch) {
            const controlPath = cdMatch[1];
            const url = controlPath.startsWith('http')
                ? controlPath
                : `http://${this.ip}:${this._dlnaPort}${controlPath}`;
            console.log('[nasne] ContentDirectory control URL:', url);
            return url;
        }

        // Fallback: try common path
        return `http://${this.ip}:${this._dlnaPort}/MediaServer_ContentDirectory/control`;
    }

    /**
     * Browse content in DLNA ContentDirectory via UPnP SOAP.
     * @param {string} objectId - Container ID to browse ('0' for root)
     * @param {number} [startIndex=0]
     * @param {number} [requestedCount=200]
     * @returns {Promise<string>} Raw DIDL-Lite XML result
     */
    async browseDlnaContent(objectId = '0', startIndex = 0, requestedCount = 200) {
        const controlUrl = this._getDlnaControlUrl();
        if (!controlUrl) throw new Error('DLNA control URL not available');

        const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${objectId}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>${startIndex}</StartingIndex>
      <RequestedCount>${requestedCount}</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>`;

        console.log(`[nasne] DLNA Browse objectId=${objectId}`);
        const response = await fetch(controlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPAction': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
            },
            body: soapBody,
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            throw new Error(`DLNA Browse failed: ${response.status}`);
        }

        return response.text();
    }

    /**
     * Find a recording in DLNA ContentDirectory by title and return its resource info.
     * @param {string} title - Recording title to search for
     * @returns {Promise<{url: string, protocolInfo: string}|null>}
     */
    async findDlnaRecording(title) {
        try {
            // Ensure DLNA port is discovered
            if (!this._dlnaPort) {
                const port = await this.discoverDlnaPort();
                if (!port) return null;
            }

            // Browse root to find recording containers
            const rootXml = await this.browseDlnaContent('0');
            console.log('[nasne] Root browse result length:', rootXml.length);

            // Extract container IDs from root
            const containerIds = this._extractContainerIds(rootXml);
            console.log('[nasne] Found containers:', containerIds);

            // Search in each container for the recording
            for (const container of containerIds) {
                const result = await this._searchContainer(container.id, title);
                if (result) return result;
            }

            // Also try browsing root directly (some devices list items at root)
            const directResult = this._findItemInXml(rootXml, title);
            if (directResult) return directResult;

            return null;
        } catch (err) {
            console.error('[nasne] DLNA recording search failed:', err);
            return null;
        }
    }

    /**
     * Extract container IDs from DIDL-Lite XML.
     */
    _extractContainerIds(xml) {
        const decoded = this._decodeXmlEntities(xml);
        const containers = [];
        const regex = /<container[^>]*id="([^"]*)"[^>]*>[\s\S]*?<dc:title>([^<]*)<\/dc:title>[\s\S]*?<\/container>/g;
        let match;
        while ((match = regex.exec(decoded)) !== null) {
            containers.push({ id: match[1], title: match[2] });
        }
        return containers;
    }

    /**
     * Search a container for a recording with matching title.
     */
    async _searchContainer(containerId, title) {
        try {
            const xml = await this.browseDlnaContent(containerId);
            const found = this._findItemInXml(xml, title);
            if (found) return found;

            // Check sub-containers
            const subContainers = this._extractContainerIds(xml);
            for (const sub of subContainers) {
                const subResult = await this._searchContainer(sub.id, title);
                if (subResult) return subResult;
            }
        } catch (err) {
            console.warn(`[nasne] Error browsing container ${containerId}:`, err);
        }
        return null;
    }

    /**
     * Find an item in DIDL-Lite XML with matching title and extract its res URL.
     */
    _findItemInXml(xml, searchTitle) {
        const decoded = this._decodeXmlEntities(xml);
        // Match items with their title and res elements
        const itemRegex = /<item[^>]*>[\s\S]*?<\/item>/g;
        let match;
        while ((match = itemRegex.exec(decoded)) !== null) {
            const itemXml = match[0];
            const titleMatch = itemXml.match(/<dc:title>([^<]*)<\/dc:title>/);
            if (!titleMatch) continue;

            const itemTitle = titleMatch[1];
            // Fuzzy match: check if titles are similar
            if (itemTitle === searchTitle || itemTitle.includes(searchTitle) || searchTitle.includes(itemTitle)) {
                console.log(`[nasne] Found DLNA item: "${itemTitle}"`);
                // Extract res URL and protocolInfo
                const resRegex = /<res\s+([^>]*)>([^<]*)<\/res>/g;
                let resMatch;
                while ((resMatch = resRegex.exec(itemXml)) !== null) {
                    const attrs = resMatch[1];
                    const resUrl = resMatch[2].trim();
                    const protoMatch = attrs.match(/protocolInfo="([^"]*)"/);
                    const protocolInfo = protoMatch ? protoMatch[1] : '';
                    console.log(`[nasne] DLNA res URL: ${resUrl}`);
                    console.log(`[nasne] protocolInfo: ${protocolInfo}`);
                    // Prefer video resources
                    if (protocolInfo.includes('video') || resUrl.includes('video')) {
                        return { url: resUrl, protocolInfo };
                    }
                }
                // Return first res if no video-specific one found
                const firstRes = itemXml.match(/<res\s+([^>]*)>([^<]*)<\/res>/);
                if (firstRes) {
                    const attrs = firstRes[1];
                    const resUrl = firstRes[2].trim();
                    const protoMatch = attrs.match(/protocolInfo="([^"]*)"/);
                    return {
                        url: resUrl,
                        protocolInfo: protoMatch ? protoMatch[1] : '',
                    };
                }
            }
        }
        return null;
    }

    /**
     * Decode XML entities in SOAP response (DIDL-Lite is often HTML-encoded).
     */
    _decodeXmlEntities(xml) {
        return xml
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
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
