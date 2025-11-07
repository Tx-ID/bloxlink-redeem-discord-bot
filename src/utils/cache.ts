type CacheEntry = {
    value: any;
    timeout?: NodeJS.Timeout;
    expiresAt?: number;
};

export class SimpleCache {
    private cache: Map<string, CacheEntry> = new Map();

    set(key: string, value: any, ttl?: number): void {
        // Clear existing timeout if this key exists
        if (this.cache.has(key)) {
            const oldEntry = this.cache.get(key);
            if (oldEntry && oldEntry.timeout) clearTimeout(oldEntry.timeout);
        }

        let entry: CacheEntry = { value };

        if (ttl && ttl > 0) {
            entry.expiresAt = Date.now() + ttl;
            entry.timeout = setTimeout(() => {
                this.cache.delete(key);
            }, ttl);
        }

        this.cache.set(key, entry);
    }

    get(key: string): any | undefined {
        const entry = this.cache.get(key);
        if (entry && entry.expiresAt && entry.expiresAt < Date.now()) {
            this.cache.delete(key);
            return undefined;
        }
        return entry?.value;
    }

    remove(key: string): void {
        const entry = this.cache.get(key);
        if (entry && entry.timeout) clearTimeout(entry.timeout);
        this.cache.delete(key);
    }
}