export default class IndexSet implements Set<number> {
    private num: number;

    constructor(iter?: Iterable<number>|number) {
        if(!iter) this.num = 0;
        else if(typeof iter === "number") {
            if(!Number.isSafeInteger(iter)) throw TypeError("IndesSet initial value is not integer");
            this.num = iter;
        }
        else {
            let i: number;
            this.num = 0;
            for(i of iter) this.num |= (1<<i);
        }
    }
    add(value: number): this {
        this.num |= (1<<value);
        return this;
    }
    delete(value: number): boolean {
        const mask = (1<<value);
        const there = !!(this.num & mask);
        if(there) this.num -= mask;
        return there;
    }
    has(value: number): boolean { return !!(this.num & (1<<value)); }
    clear(): void { this.num = 0; }
    /**
     * Faster than ```set.size === 0```
     * @returns Whether the set is empty
     */
    isEmpty(): boolean { return this.num === 0; }
    forEach(callbackfn: (value: number, value2: number, set: IndexSet) => void, thisArg?: any): void {
        for(var mask=1, i=0; mask > 0; (mask <<= 1, i++)) {
            if(this.num & mask) callbackfn.call(thisArg, i, i, this);
        }
    }
    /**
     * Maps the indexes (increasing order) into an array through a provided callback
     * @returns The constructed array
     */
    toArray<T>(callbackfn: (index: number) => T, thisArg?: any): T[] {
        const res: T[] = [];
        for(var mask=1, i=0; mask > 0; (mask <<= 1, i++)) {
            if(this.num & mask) res.push(callbackfn.call(thisArg, i));
        }
        return res;
    }
    get size(): number {
        let count = 0;
        for(var mask=1; mask > 0; mask <<= 1) {
            if(this.num & mask) count++;
        }
        return count;
    }
    * values(): IterableIterator<number> {
        for(var mask=1, i=0; mask > 0; (mask <<= 1, i++)) {
            if(this.num & mask) yield i;
        } 
        return;
    }
    * entries(): IterableIterator<[number, number]> {
        for(var mask=1, i=0; mask > 0; (mask <<= 1, i++)) {
            if(this.num & mask) yield ([i, i]);
        } 
        return;
    }
    keys(): IterableIterator<number> { return this.values(); }
    [Symbol.iterator]() { return this.values(); }
    get [Symbol.toStringTag]() { return "IndexSet"; }

    static union(...sets: IndexSet[]) {
        let union = 0;
        for(var i=0; i<sets.length; i++) union |= sets[i].num;
        return new IndexSet(union);
    }
    static intersection(...sets: IndexSet[]) {
        if(sets.length === 0) return new IndexSet();
        let intersec = sets[0].num;
        for(var i=1; i<sets.length; i++) intersec &= sets[i].num;
        return new IndexSet(intersec);
    }
    /**
     * Computes the diffrence between the two sets (a - b)
     * @param a 
     * @param b 
     * @returns 
     */
    static difference(a: IndexSet, b: IndexSet) {
        return new IndexSet(a.num - (a.num & b.num));
    }
}