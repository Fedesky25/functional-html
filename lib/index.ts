import { join as join_path, basename, dirname, relative } from "path";
import { readFile, watch } from "fs/promises";
import { parser } from "posthtml-parser";
import IndexSet from "./IndexSet";
import { walk, dispatchNodeTag, flatten } from "./content-parser";
import type { Component, Context, Props, SlotOptions, Slots, SureNode, SureNodeTag, Tree } from "./types";

const validComponentName = /[\w-]+/;

interface CreationContext {
    path: string;
    dir: string;
    props: string[];
    tasks: Promise<[string, number]>[];
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

abstract class Scope {
    protected readonly root: string;
    protected readonly globals: object;

    constructor(root: string, globals: object = {}) {
        this.root = root ? root : './';
        this.globals = globals;
    }

    public from(text: string, path: string) {
        const cctx: CreationContext = { path, dir: dirname(path), props: [], tasks: [] };
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
            if(element.tag === "link") this.parseLink(element, cctx);
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
        return this.build(template, cctx.tasks, cctx.props, path);
    }

    protected async build(template: Tree | SureNodeTag, tasks: Promise<[string,number]>[], props: string[], path: string): Promise<Component> {
        const aliases_entries = await Promise.all(tasks);
        const aliases = new Map(aliases_entries);
        const ctx: Context = { code: '', path, aliases, slotType: "none", cmps: this.components };
        const expression = Array.isArray(template) ? walk(template, ctx) : dispatchNodeTag(template, ctx);
        const fn = new Function("props", "slots", "globals", "$components", `const {${props.join(',')}} = props; ${ctx.code}; return ${expression}`);
        const ast = (props: Props, slots: Slots) => fn(props, slots, this.globals, this.components) as Tree;
        const deps = new IndexSet();
        for(var i=0; i<aliases_entries.length; i++) deps.add(aliases_entries[i][1]);
        return { ast, deps, slot: ctx.slotType }
    }

    private parseLink(node: SureNodeTag, ctx: CreationContext) {
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
                ctx.tasks.push(this.createDependecyTuple(name, join_path(dirname(ctx.path), href)))
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

    protected abstract createDependecyTuple(name: string, path: string): Promise<[string, number]>;
    protected abstract get components(): Component[];
}

export class Builder extends Scope {
    private readonly cache = new ComponentPool();

    componentify(path: string) {
        let c = this.cache.get(path);
        if(!c) {
            c = this.fromFile(path);
            this.cache.add(path, c);
        }
        return c;
    }

    protected async fromFile(path: string) {
        const file = await readFile(join_path(this.root, path), "utf-8");
        return await this.from(file, path);
    }

    protected async createDependecyTuple(name: string, path: string): Promise<[string, number]> {
        let p = this.cache.indexOf(path) || this.cache.add(path, this.fromFile(path));
        return [name, await p];
    }

    protected get components(): Component<keyof SlotOptions>[] {
        return this.cache.resolved;
    }
}

class ReactiveUnit<T> {
    private readonly subs = new Set<(value: T) => any>();
    clear() { this.subs.clear(); }
    notify(value: T) { this.subs.forEach(fn => fn(value)); }
    sub(callback: (value: T) => any) { this.subs.add(callback); }
    unsub(callback: (value: T) => any) { this.subs.delete(callback); }
}

interface Notification {
    type: "ok"|"slotchange"|"error"|"rename";
    index: number;
}

export class Watcher extends Scope {
    private readonly cmps: Component[] = [];
    private readonly errors: (Error|null)[] = [];
    private readonly reacts: ReactiveUnit<Notification>[] = [];
    private readonly p2i = new Map<string, number>();

    watch(path: string, callback: Function) {
        this.reacts[this.get(path)].sub(e => {

        })
    }

    private get(path: string) {
        let index = this.p2i.get(path);
        if(!index) {
            index = this.reacts.push(new ReactiveUnit())-1;
            this.p2i.set(path, index);
            this.handle(path, index);
        }
        return index;
    }

    private async handle(path: string, index: number) {
        const unit = this.reacts[index];
        const dep_errors = new IndexSet();
        
        const notify = (type: Notification["type"]) => unit.notify({type,index});
        const propagate = async (e: Notification) => {
            switch(e.type) {
                case "ok":
                    dep_errors.delete(e.index);
                    notify(!this.errors[index] && dep_errors.isEmpty() ? "ok" : "error");
                    break;
                case "slotchange": 
                    dep_errors.delete(e.index);
                    if(dep_errors.isEmpty()) this.redo(path, index, propagate);
                    else notify("error");
                    break;
                case "error":
                    dep_errors.add(e.index);
                    notify("error");
                    break;
                case "rename":
                    this.errors[index] = Error("A dependecy was renamed");
                    notify("error");
                    break;
            }
        };

        await this.redo(path, index, propagate);
        const watcher = watch(join_path(this.root, path));
        for await (const e of watcher) {
            if(e.eventType === "rename") {
                const old = path;
                path = relative(this.root, e.filename);
                this.p2i.set(path, index).delete(old);
                notify("rename");
                unit.clear();
            } else {
                this.redo(path, index, propagate);
            }
        }
    }

    private async redo(path: string, index: number, propagate: (e: Notification) => any) {
        const old = this.cmps[index];
        const unit = this.reacts[index];
        try {
            const cmp = await this.fromFile(path);
            this.cmps[index] = cmp;
            this.errors[index] = null;
            if(old) {
                const slotchange = old.slot !== cmp.slot;
                IndexSet.difference(old.deps, cmp.deps).forEach(i => this.reacts[i].unsub(propagate));
                IndexSet.difference(cmp.deps, old.deps).forEach(i => this.reacts[i].sub(propagate));
                unit.notify({type: slotchange ? "slotchange" : "ok", index});
            } else {
                cmp.deps.forEach(i => this.reacts[i].unsub(propagate));
                unit.notify({type: "ok", index});
            }
        } catch(err) {
            this.errors[index] = err;
            unit.notify({type: "error", index});
        }
    }

    private getErrorsOf(index: number): Error[] {
        const deps = this.completeDependeciesOf(index);
        if(this.errors[index]) return [this.errors[index] as Error];
        const res: Error[] = [];
        let err: Error|null;
        for(var i of deps) {
            err = this.errors[i];
            if(err) res.push(err);
        }
        return res;
    }

    private completeDependeciesOf(index: number): IndexSet {
        const c = this.cmps[index];
        if(!c) return new IndexSet();
        if(c.deps.isEmpty()) return c.deps;
        return IndexSet.union(c.deps, ...c.deps.toArray(i => this.completeDependeciesOf(i)));
    }

    private async fromFile(path: string): Promise<Component> {
        const file = await readFile(join_path(this.root, path), "utf-8");
        return await this.from(file, path);
    }

    protected createDependecyTuple(name: string, path: string): Promise<[string, number]> {
        let index = this.p2i.get(path);
        if(index === undefined) {
            const unit = new ReactiveUnit<Notification>()
            index = this.reacts.push(unit)-1;
            this.p2i.set(path, index);
            this.handle(path, index);
            return new Promise(res => {
                unit.sub(fn);
                function fn(e: Notification) {
                    if(e.type !== "ok" && e.type !== "slotchange") return;
                    unit.unsub(fn);
                    res([name, index as number]);
                }
            });
        } else {
            return Promise.resolve([name, index]);
        }
    }

    protected get components(): Component<keyof SlotOptions>[] {
        return this.cmps;
    }
}