import { parse as parse_path, join as join_path, basename } from "path";
import { readFile } from "fs/promises";
import { parser, Node } from "posthtml-parser";


type Tree = (Node|Node[])[];
interface SureNodeTag {
    tag: string;
    attrs?: Record<string, string|true>;
    content?: Tree;
}
type SureNode = string | SureNodeTag; 
type FlatTree = SureNode[];

type Props = Record<string, any>;
type Slots = Record<string, Tree>;

const validComponentName = /[\w-]+/;
const exprRegExp = /{@\s*([\S\s]+)\s*\/}/g;
const lineRegExp = /\s*\n\s*/g;
const spaceRegExp = /^\s*$/;

const cache = new Map<string, HTMLComponent>();

export async function componentify(path: string): Promise<HTMLComponent> {
    const cached = cache.get(path);
    if(cached) return cached;
    const { dir, name } = parse_path(path);
    const file = await readFile(path, "utf-8");
    const res = new HTMLComponent(file, dir, name);
    cache.set(path, res);
    await res.ready;
    return res;
}

export class HTMLComponent {
    private readonly name: string;
    private readonly dir: string;
    private readonly aliases = new Map<string, HTMLComponent>();
    private readonly declared_props: string[] = [];
    private fn: Function;
    private tasks: Promise<any>[] = [];
    readonly ready: Promise<this>;
    
    constructor(file: string, dir: string, name: string) {
        this.dir = dir;
        this.name = name;
        const base = flatten(parser(file, {
            recognizeNoValueAttribute: true
        }));
        let element: SureNode;
        let template: Tree|null = null;
        for(var i=0; i< base.length; i++) {
            element = base[i];
            if(typeof element !== "object") continue;
            if(element.tag === "link") this.parseLink(element);
            else if(element.tag === "template") {
                if(template) console.warn("Multiple template definition in "+this.path);
                else if(!Array.isArray(element.content)) throw Error(`${this.path} has no template content`);
                else template = element.content;
            }
        }
        if(!template) throw Error("Missing template in "+this.path);
        this.ready = HTMLComponent.readyHelper(this, template);
    }

    private parseLink(node: SureNodeTag) {
        if(!node.attrs) return;
        switch(node.attrs.rel) {
            case "import": {
                const href = node.attrs.href;
                if(href == null || href === true) {
                    console.warn("Missing href attribute on import link at "+this.path);
                    break;
                }
                const p = componentify(join_path(this.dir, href));
                const name = node.attrs.as || basename(href, ".html");
                if(name === true || !validComponentName.test(name)) throw Error(`Invalid imported component name: "${name}" in ${this.path}`);
                this.tasks.push(p.then(c => this.aliases.set(name,c)))
                break;
            }
            case "prop":
            case "attr":
            case "attribute": {
                const name = node.attrs.title;
                if(name == null || name === true) {
                    console.warn("Missing title attribute on attribute/prop link in "+this.path);
                    break;
                }
                this.declared_props.push(name);
                break;
            }
            default: {
                console.warn("Unrecognized rel attribute value in link at "+this.path);
            }
        }
    }

    private walk(tree: FlatTree) {
        const len = tree.length;
        const code: string[] = [];
        let node: SureNode;
        for(var i=0; i<len; i++) {
            node = tree[i];
            if(typeof node === "string") {
                node = node.replace(lineRegExp, '');
                if(node) code.push(quote(node));
            }
            else {
                const tag = node.tag;
                code.push(
                    tag == "slot"
                    ? this.handleSlot(node)
                    : tag == "each"
                    ? this.eachClause(node)
                    : tag == "conditional"
                    ? this.conditionalClause(node)
                    : this.aliases.has(tag)
                    ? this.handleImport(node)
                    : this.normalTag(node)
                );
            }
        }
        return '[' + code.join(',') + ']'
    }

    private normalTag(node: SureNodeTag) {
        let res = `{tag:"${node.tag}"`;
        if(node.content) {
            const code = this.walk(flatten(node.content));
            res +=  ",content:"+code;
        }
        if(node.attrs) res += ",attrs:" + this.hydratedAttrs(node.attrs);
        return res + '}';
    }

    private handleImport(node: SureNodeTag) {
        const name = node.tag;
        let slots = '{';
        if(node.content) {
            const content = flatten(node.content);
            const len = content.length;
            let item: SureNode;
            let slotName: string|true;
            for(var i=0; i<len; i++) {
                item = content[i];
                if(typeof item === "string") {
                    if(!spaceRegExp.test(item)) console.warn(`Text "${item}" inside ${name} component call is skipped (at ${this.path})`);
                }
                else {
                    if(!item.attrs) throw Error(`Direct children of component (${name}) must specify slot attribute (at ${this.path})`);
                    slotName = item.attrs.slot;
                    if(slotName == null || slotName === true) throw Error(`Direct children of component (${name}) must specify slot attribute (at ${this.path})`);
                    slots += `"${slotName}:${item.content ? this.walk(flatten(node.content)) : "null"}`;
                }
            }
        }
        slots += '}';
        const props = node.attrs ? this.hydratedAttrs(node.attrs) : "{}";
        return `components.get("${name}").render(${props},${slots})`;
    }

    private handleSlot(node: SureNodeTag) {
        if(!(node.attrs && node.attrs.name)) throw Error(`Missing slot name in ${this.path}`);
        const name = node.attrs.name;
        const def = node.content ? this.walk(flatten(node.content)) : "null";
        return `slots["${name}"] || ${def}`;
    }

    private conditionalClause(node: SureNodeTag) {
        if(!node.content) throw Error("Missing conditional clause body");
        const cases = flatten(node.content);
        const len = cases.length;
        let item: SureNode;
        let code = '';
        let attrs: Record<string, string|true> | undefined;
        let condition: string | true;
        let content: Tree|undefined;

        loop:
        for(var i=0; i<len; i++) {
            item = cases[i];
            if(typeof item === "string") {
                if(!spaceRegExp.test(item)) console.warn(`String "${item}" inside conditional tag is skipped (at ${this.path})`);
                continue;
            }
            switch(item.tag) {
                case "case": {
                    attrs = item.attrs;
                    condition = attrs ? (attrs.condition || attrs.if || true) : true;
                    if(condition === true) throw Error("Missing condition in case in "+this.path);
                    content = item.content;
                    code += `(${condition})?${content?this.walk(flatten(content)):"null"}:`;
                    break;
                }
                case "default": {
                    content = item.content;
                    code += (content ? this.walk(flatten(content)) : "null"); 
                    break loop;
                }
                default: {
                    console.warn(`Only "case" and "default" tags are allowed inside conditional: got ${item.tag} in ${this.path}`);
                }
            }
        }
        if(code.length === 0) console.warn(`Missing conditional content in ${this.path}`);
        if(i >= len) code += "null";
        return code;
    }

    private eachClause(node: SureNodeTag) {
        const body = node.content;
        if(!body) throw Error("Missing each clause body");
        const attrs = node.attrs;
        if(!attrs) throw Error("Missing each clause attributes (array, item) in "+this.path);
        const arrayName = attrs.array || attrs.in;
        if(arrayName == null || arrayName === true || arrayName.length === 0) throw Error("Name of array is missing in each clause in "+this.path);
        let itemName = attrs.item;
        if(itemName == null) throw Error("Missing item attribute in each clause in "+this.path);
        if(itemName === true) itemName = "item";
        let indexName = attrs.item;
        if(indexName === true) indexName = "index";
        return `${arrayName}.map(${indexName ? '('+itemName+','+indexName+')' : itemName}=>(${this.walk(flatten(body))}))`
    }

    private hydratedAttrs(attrs: Record<string, string|true>) {
        let value: string|true;
        const code: string[] = [];
        for(var key in attrs) {
            value = attrs[key];
            code.push(`"${key}":${value === true ? value : quote(value)}`);
        }
        return '{' + code.join(',') + '}';
    }

    get path() { return this.dir + "/" + this.name + ".html"; }

    render(props: Props = {}, slots: Slots = {}): Tree {
        if(!this.fn) throw("Cannot render before ready at "+this.path);
        return this.fn(props, slots, this.aliases);
    }

    private static async readyHelper<S extends HTMLComponent>(self: S, content: Tree): Promise<S> {
        await Promise.all(self.tasks);
        const code = self.walk(flatten(content));
        // console.log(code);
        self.fn = new Function("props", "slots", "components", `const {${self.declared_props.join(",")}} = props; return ${code};`);
        return self;
    }
}

function flatten(tree: Tree) {
    let strike = 0;
    let node: Node|Node[];
    var i = 0;
    while(i<tree.length) {
        node = tree[i];
        if(node == null || typeof node === "number" || typeof node === "boolean") {
            strike++;
            i++;
        }
        else if(Array.isArray(node)) tree.splice(i, 1, ...node);
        else if(typeof node === "object" && typeof node.tag === "boolean") {
            if(!node.content) { strike++; i++; }
            else if(Array.isArray(node.content)) tree.splice(i, 1, ...node.content);
            else tree.splice(i, 1, node.content);
        }
        else {
            if(strike > 0) tree.splice(i-strike, strike);
            i++;
        }
    }
    return tree as FlatTree;
}

const quote1RegExp = /"/g;
const quote2RegExp = /`/g;
function quote(str: string) {
    if(str.indexOf("${") === -1) return '"' + str.replace(quote1RegExp, '\\"') + '"';
    else return '`' + str.replace(quote2RegExp, '\\`') + '`';
}