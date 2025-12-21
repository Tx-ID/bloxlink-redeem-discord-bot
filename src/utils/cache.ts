type CacheEntry = {
    value: any;
    timeout?: NodeJS.Timeout;
    expiresAt?: number;
};

export class SimpleCache {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly MAX_SIZE = 10000;
    private readonly DEFAULT_TTL = 300000; // 5 minutes

    set(key: string, value: any, ttl?: number): void {
        // Clear existing timeout if this key exists
        if (this.cache.has(key)) {
            const oldEntry = this.cache.get(key);
            if (oldEntry && oldEntry.timeout) clearTimeout(oldEntry.timeout);
            // Delete and re-add to update order (LRU-like behavior)
            this.cache.delete(key);
        } else if (this.cache.size >= this.MAX_SIZE) {
            // Remove the oldest entry
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.remove(oldestKey);
            }
        }

        let entry: CacheEntry = { value };

        const effectiveTtl = ttl ?? this.DEFAULT_TTL;

        if (effectiveTtl > 0) {
            entry.expiresAt = Date.now() + effectiveTtl;
            entry.timeout = setTimeout(() => {
                this.cache.delete(key);
            }, effectiveTtl);
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