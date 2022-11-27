import { join as join_path, basename, dirname, resolve } from "path";
import { readFile, watch as watchFile } from "fs/promises";
import { parser } from "posthtml-parser";
import IndexSet from "./IndexSet";
import { walk, dispatchNodeTag, flatten } from "./content-parser";
import type { ASTBuilder, Component, Context, Props, SlotOptions, Slots, SlotType, SureNode, SureNodeTag, Tree } from "./types";

const validComponentName = /[\w-]+/;

interface CreationContext {
    path: string;
    dir: string;
    props: string[];
    deps: [string, string][];
}

interface OuterData {
    template: SureNodeTag | Tree;
    deps: [alias: string, path: string][];
    props: string[];
}

class ComponentPool {
    private readonly name2index = new Map<string, number>();
    private readonly waiting = new Map<string, Promise<number>>();
    readonly resolved = new Array<Component>();

    indexOf(path: string) {
        let i = this.name2index.get(path);
        if(i !== undefined) return Promise.resolve(i);
        return this.waiting.get(path);
    }
    get(path: string) {
        let i = this.name2index.get(path);
        if(i !== undefined) return Promise.resolve(this.resolved[i]);
        const p = this.waiting.get(path);
        if(p) return new Promise<Component>(async res => res(this.resolved[await p]));
        return;
    }
    async add(path: string, p: Promise<Component>) {
        const pi = this.wrap(p);
        this.waiting.set(path, pi);
        const i = await pi;
        this.waiting.delete(path);
        return i;
    }
    private async wrap(p: Promise<Component>) {
        return this.resolved.push(await p) - 1;
    }
}

function outer(this: void, text: string, path: string): OuterData {
    const cctx: CreationContext = { path, dir: dirname(path), props: [], deps: [] };
    const base = flatten(parser(text, {
        recognizeNoValueAttribute: true,
        recognizeSelfClosing: true,
    }));
    const len = base.length;
    let element: SureNode;
    let template: SureNodeTag|Tree|null = null;
    for(var i=0; i< len; i++) {
        element = base[i];
        if(typeof element !== "object") continue;
        if(element.tag === "link") parseLink(element, cctx);
        else if(element.tag === "template") {
            if(template) throw Error("Multiple template definition in "+path);
            if(!Array.isArray(element.content)) throw Error(`${path} has no template content`);
            else template = element.content;
        } else if(element.attrs && element.attrs.template != null) {
            if(template) throw Error("Multiple template definition in "+path);
            delete element.attrs.template;
            template = element;
        }
    }
    if(!template) throw Error("Missing template in "+path);
    return { template, props: cctx.props, deps: cctx.deps };
}

function parseLink(this: void, node: SureNodeTag, ctx: CreationContext) {
    if(!node.attrs) return;
    switch(node.attrs.rel) {
        case "import": {
            const href = node.attrs.href;
            if(href == null || href === true) {
                console.warn("Missing href attribute on import link at "+ctx.path);
                break;
            }
            const name = node.attrs.as || basename(href, ".html");
            if(name === true || !validComponentName.test(name)) throw Error(`Invalid imported component name: "${name}" in ${ctx.path}`);
            ctx.deps.push([name, join_path(dirname(ctx.path), href)]);
            break;
        }
        case "prop":
        case "attr":
        case "attribute": {
            const name = node.attrs.title;
            if(name == null || name === true) {
                console.warn("Missing title attribute on attribute/prop link in "+ctx.path);
                break;
            }
            ctx.props.push(name);
            break;
        }
        default: {
            console.warn("Unrecognized rel attribute value in link at "+ctx.path);
        }
    }
}

function inner(this: void, template: SureNodeTag|Tree, props: string[], aliases: Map<string, number>, path: string, components: Component[], globals: object) {
    const ctx: Context = { code: '', path, aliases, slotType: "none", cmps: components };
    const expression = Array.isArray(template) ? walk(template, ctx) : dispatchNodeTag(template, ctx);
    const fn = new Function("props", "slots", "globals", "$components", `const {${props.join(',')}} = props; ${ctx.code}; return ${expression}`);
    const ast = (props: Props, slots: Slots) => fn(props, slots, globals, components) as Tree;
    return { ast, slot: ctx.slotType }
}

export class Builder {
    private readonly root: string;
    private readonly globals: object;
    private readonly cache = new ComponentPool();
    constructor(root: string = "./", globals: object = {}) {
        this.root = root;
        this.globals = globals;
    }
    /**
     * Retrieves the component of a html file caching its result
     * @param path path to the .html file
     * @returns 
     */
    componentify(path: string) {
        let c = this.cache.get(path);
        if(!c) {
            c = this.fromFile(path);
            this.cache.add(path, c);
        }
        return c;
    }
    /**
     * Creates a component from the provided text
     * @param text Text of the component (content of a .html file)
     * @param path String which identifies the component (path to the .html file)
     * @returns 
     */
    async from(text: string, path: string): Promise<Component> {
        const data = outer(text, path);
        const deps = await Promise.all(data.deps.map(t => this.toTuple(t)));
        const aliases = new Map(deps);
        const inn = inner(data.template, data.props, aliases, path, this.cache.resolved, this.globals);
        const isd = new IndexSet();
        for(var i=0; i<deps.length; i++) isd.add(deps[i][1]);
        return {ast: inn.ast, slot: inn.slot};
    }

    protected async fromFile(path: string): Promise<Component> {
        // console.log(`Reading ${resolve(this.root, path)}`);
        const file = await readFile(resolve(this.root, path), "utf-8");
        return this.from(file, path);
    }

    private async toTuple(alias: [string, string]): Promise<[string, number]> {
        const p = this.cache.indexOf(alias[1]) || this.cache.add(alias[1], this.fromFile(alias[1]));
        return [alias[0], await p];
    }
}

type ComponentChangeType = "ok"|"slotchange"|"error"|"rename";
type ComponentChangeHook = (type: ComponentChangeType, index: number) => void;

const dummyast = (props: Props, slots: SlotOptions["none"]) => ([]);

/**
 * Creates a html component file watcher with a scope
 * @param root root of the component files
 * @param globals object available in each component
 * @returns 
 */
export function createWatcher(root: string = "./", globals: object = {}, timeout: number = 500) {
    const p2i = new Map<string, number>();
    const cmps: ReactiveComponent[] = [];

    function watch(
        path: string, 
        callback: <T extends SlotType>(ast: ASTBuilder<T>, slot: T) => void, 
        onerror?: (errors: Error[]) => void
    ) {
        let cmp: ReactiveComponent;
        const real_path = join_path(root, path);
        let i = p2i.get(real_path);
        if(i === undefined) {
            i = cmps.length;
            cmp = new ReactiveComponent(i,real_path);
            p2i.set(real_path, i);
            cmps[i] = cmp
        } else {
            cmp = cmps[i];
        }
        cmp.sub(state => {
            switch(state) {
                case "ok":
                case "slotchange":
                case "rename":
                    callback(cmp.ast, cmp.slot);
                    break;
                case "error":
                    onerror && onerror(cmp.getFaultTree().toArray(i => cmps[i].error as Error));
                    break;
            }
        });
    }

    function getindex(path: string) {
        let i = p2i.get(path);
        if(i !== undefined) return i;
        i = cmps.length;
        const cmp = new ReactiveComponent(i, path);
        p2i.set(path, i);
        cmps[i] = cmp;
        return i;
    }

    class ReactiveComponent {
        public ast: ASTBuilder<SlotType> = dummyast;
        public slot: SlotType;
        public index: number;
        public error: Error|null = null;
        
        private deps = new IndexSet();
        private waiting = new IndexSet();
        private faulting = new IndexSet();
        private subs = new Set<ComponentChangeHook>();
        private path: string;
        private hook: ComponentChangeHook;
        private request: NodeJS.Timeout | null = null;
    
        constructor(index: number, path: string) {
            this.index = index;
            this.path = path;
            this.hook = this.propagate.bind(this);
            this.requestBuild();
            this.watch();
        }
        async watch() {
            const watcher = watchFile(this.path);
            for await (const e of watcher) {
                if(e.eventType === "rename") {
                    p2i.set(e.filename, this.index).delete(this.path);
                    this.path = e.filename;
                    this.notify("rename");
                    this.subs.clear();
                } else {
                    if(!this.waiting.isEmpty()) continue;
                    this.requestBuild();
                }
            }
        }
        private requestBuild() {
            if(this.request) clearTimeout(this.request);
            this.request = setTimeout(() => this.build(), timeout);
        }
        async build() {
            this.request = null;
            try {
                const file = await readFile(resolve(this.path), "utf-8");
                const data = outer(file, this.path);

                const newdeps = new IndexSet();
                const aliases = new Map<string, number>();
                const len = data.deps.length;
                for(var i=0; i<len; i++) {
                    const path = join_path(data.deps[i][1])
                    const j = getindex(path);
                    aliases.set(data.deps[i][0],j);
                    newdeps.add(j);
                }
                
                const diff_plus = IndexSet.difference(newdeps, this.deps);
                diff_plus.forEach(i => {
                    const c = cmps[i];
                    if(c.ast === dummyast) this.waiting.add(i);
                    if(!c.ok) this.faulting.add(i);
                    c.sub(this.hook);
                });
                
                const diff_minus = IndexSet.difference(this.deps, newdeps);
                diff_minus.forEach(i => cmps[i].unsub(this.hook));
                this.faulting.subtract$(diff_minus);
                this.waiting.subtract$(diff_minus);

                this.deps = newdeps;
                if(!this.faulting.isEmpty()) return; // if it depends on other components 
                const { ast, slot } = inner(data.template, data.props, aliases, this.path, cmps as unknown as Component<SlotType>[], globals);
                const slotchanged = this.slot && this.slot !== slot;
                this.ast = ast;
                this.slot = slot;
                this.error = null;
                this.notify(slotchanged ? "slotchange" : "ok");
            }
            catch(err) {
                this.error = err;
                this.notify("error");
            }
        }
        private propagate(state: ComponentChangeType, index: number) {
            let ok = false;
            const was_waiting = this.waiting.delete(index);
            switch(state) {
                case "ok":
                    this.faulting.delete(index);
                    ok = this.ok;
                    break;
                case "slotchange":
                    this.faulting.delete(index);
                    if(this.faulting.isEmpty()) return this.requestBuild();
                    break;
                case "error":
                    this.faulting.add(index);
                    break;
                case "rename":
                    this.error = Error("A dependency was renamed");
                    this.faulting.delete(index);
                    this.deps.delete(index);
                    break;
            }
            if(!this.waiting.isEmpty()) return;
            if(ok && was_waiting) this.requestBuild();
            else this.notify(ok ? "ok" : "error");
        }
        private notify(state: ComponentChangeType) {
            this.subs.forEach(fn => fn(state, this.index));
        }
        sub(fn: ComponentChangeHook) {
            this.subs.add(fn);
        }
        unsub(fn: ComponentChangeHook) {
            this.subs.delete(fn);
        }
        get ok() {
            return !this.error && this.faulting.isEmpty();
        }
        getFaultTree() {
            const res = new IndexSet();
            if(this.error) res.add(this.index);
            for(var i of this.faulting) {
                if(cmps[i].error) res.add(i);
                else res.union$(cmps[i].getFaultTree())
            }
            return res;
        }
    }
    return watch;
}