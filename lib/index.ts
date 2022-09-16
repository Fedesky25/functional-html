import { join as join_path, basename, dirname } from "path";
import { readFile } from "fs/promises";
import { parser, Node } from "posthtml-parser";

type Tree = (Node|Node[])[];

type Props = Record<string, any>;
type Slots = Record<string, Tree>;

type HTMLComponent = (props: Props, slots: Slots) => Tree;
type ComponentTask = Promise<[string, HTMLComponent]>;

interface CreationContext {
    path: string;
    dir: string;
    props: string[];
    tasks: ComponentTask[];
}

interface Context {
    path: string;
    code: string;
    aliases: Map<string, HTMLComponent>;
}

type Attributes = Record<string, string|true>;
interface SureNodeTag {
    tag: string;
    attrs?: Attributes;
    content?: Tree;
}
type SureNode = string | SureNodeTag; 
type FlatTree = SureNode[];

const validComponentName = /[\w-]+/;
const lineRegExp = /\s*\n\s*/g;
const spaceRegExp = /^\s*$/;

const cache = new Map<string, HTMLComponent>();

export async function componentify(path: string) {
    const cached = cache.get(path);
    if(cached) return cached;
    const file = await readFile(path, "utf-8");
    const res = await createComponentFrom(file, path);
    cache.set(path, res);
    return res;
}

export async function createComponentFrom(this: void, text: string, path: string): Promise<HTMLComponent> {
    const props: string[] = []
    const tasks: ComponentTask[] = [];
    const cctx: CreationContext = { path, dir: dirname(path), props, tasks };
    const base = flatten(parser(text, {
        recognizeNoValueAttribute: true
    }));
    const len = base.length;
    let element: SureNode;
    let template: Tree|null = null;
    for(var i=0; i< len; i++) {
        element = base[i];
        if(typeof element !== "object") continue;
        if(element.tag === "link") parseLink(element, cctx);
        else if(element.tag === "template") {
            if(template) console.warn("Multiple template definition in "+path);
            else if(!Array.isArray(element.content)) throw Error(`${path} has no template content`);
            else template = element.content;
        }
    }
    if(!template) throw Error("Missing template in "+path);
    const components = await Promise.all(cctx.tasks);
    const aliases = new Map(components);
    const ctx: Context = { code: '', path, aliases };
    const returnExpression = walk(template, ctx);
    const fn = new Function("props", "slots", "components", `const {${cctx.props.join(',')}} = props; ${ctx.code}; return ${returnExpression}`);
    return (props: Props, slots: Slots) => fn(props, slots, aliases);
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
            const p = componentify(join_path(ctx.dir, href));
            const name = node.attrs.as || basename(href, ".html");
            if(name === true || !validComponentName.test(name)) throw Error(`Invalid imported component name: "${name}" in ${ctx.path}`);
            ctx.tasks.push(p.then(c => ([name,c])));
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

function walk(this: void, tree: Tree, ctx: Context) {
    const flat = flatten(tree);
    const len = flat.length;
    const code: string[] = [];
    let node: SureNode;
    for(var i=0; i<len; i++) {
        node = flat[i];
        if(typeof node === "string") {
            node = node.replace(lineRegExp, '');
            if(node) code.push(quote(node));
        }
        else {
            const tag = node.tag;
            code.push(
                tag == "slot"
                ? handleSlot(node, ctx)
                : tag == "each"
                ? eachClause(node, ctx)
                : tag == "conditional"
                ? conditionalClause(node, ctx)
                : ctx.aliases.has(tag)
                ? handleImport(node, ctx)
                : normalTag(node, ctx)
            );
        }
    }
    return '[' + code.join(',') + ']'
}

function handleSlot(this: void, node: SureNodeTag, ctx: Context) {
    if(!(node.attrs && node.attrs.name)) throw Error(`Missing slot name in ${ctx.path}`);
    const name = node.attrs.name;
    const def = node.content ? walk(node.content, ctx) : "null";
    return `slots["${name}"] || ${def}`;
}

function eachClause(this: void, node: SureNodeTag, ctx: Context) {
    const body = node.content;
    if(!body) {
        console.warn("Missing each clause body in "+ctx.path);
        return "null";
    }
    const attrs = node.attrs;
    if(!attrs) throw Error("Missing each clause attributes (array, item) in "+ctx.path);
    const arrayName = attrs.array || attrs.in;
    if(arrayName == null || arrayName === true || arrayName.length === 0) throw Error("Name of array is missing in each clause in "+ctx.path);
    let itemName = attrs.item;
    if(itemName == null) {
        itemName = "_";
        console.warn("Item is unused in each clause in "+ctx.path);
    }
    else if(itemName === true) itemName = "item";
    let indexName = attrs.index;
    if(indexName === true) indexName = "index";
    return `${arrayName}.map(${indexName ? '('+itemName+','+indexName+')' : itemName}=>(${walk(body,ctx)}))`;
}

function conditionalClause(this: void, node: SureNodeTag, ctx: Context) {
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
            if(!spaceRegExp.test(item)) console.warn(`String "${item}" inside conditional tag is skipped (at ${ctx.path})`);
            continue;
        }
        switch(item.tag) {
            case "case": {
                attrs = item.attrs;
                condition = attrs ? (attrs.condition || attrs.if || true) : true;
                if(condition === true) throw Error("Missing condition in case in "+ctx.path);
                content = item.content;
                code += `(${condition})?${content ? walk(content, ctx) : "null"}:`;
                break;
            }
            case "default": {
                content = item.content;
                code += (content ? walk(content,ctx) : "null"); 
                break loop;
            }
            default: {
                console.warn(`Only "case" and "default" tags are allowed inside conditional: got ${item.tag} in ${ctx.path}`);
            }
        }
    }
    if(code.length === 0) console.warn(`Missing conditional content in ${ctx.path}`);
    if(i >= len) code += "null";
    return code;
}

function handleImport(this: void, node: SureNodeTag, ctx: Context) {
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
                if(!spaceRegExp.test(item)) console.warn(`Text "${item}" inside ${name} component call is skipped (at ${ctx.path})`);
            }
            else {
                if(!item.attrs) throw Error(`Direct children of component (${name}) must specify slot attribute (at ${ctx.path})`);
                slotName = item.attrs.slot;
                if(slotName == null || slotName === true) throw Error(`Direct children of component (${name}) must specify slot attribute (at ${ctx.path})`);
                slots += `"${slotName}:${item.content ? walk(item.content, ctx) : "null"}`;
            }
        }
    }
    slots += '}';
    const props = node.attrs ? readProps(node.attrs) : "{}";
    return `components.get("${name}")(${props},${slots})`;
}

function normalTag(this: void, node: SureNodeTag, ctx: Context) {
    let res = `{tag:"${node.tag}"`;
    if(node.content) {
        const code = walk(node.content, ctx);
        res +=  ",content:"+code;
    }
    if(node.attrs) res += ",attrs:" + readAttrs(node.attrs);
    return res + '}';
}

function readAttrs(this: void, attrs: Attributes) {
    let value: string|true;
    const code: string[] = [];
    let className = (attrs.class === true || attrs.class == undefined) ? "" : attrs.class;
    for(var key in attrs) {
        value = attrs[key];
        if(key === "class") continue;
        if(key.startsWith("class:")) {
            const name = key.slice(6);
            const condition = value === true ? name : value;
            className += `\${(${condition}) ? "${className.length ? ' ' : ''}${name}" : ""}`;
        }
        else code.push(`"${key}":${value === true ? value : quote(value)}`);
    }
    if(className.length) code.push(`"class": ${quote(className)}||false`);
    else if(attrs.class === true) code.push('"class":true');
    return '{' + code.join(',') + '}';
}

function readProps(this: void, attrs: Attributes) {
    let value: string|true;
    const code: string[] = [];
    for(var key in attrs) {
        value = attrs[key];
        if(value === true) code.push(`"${key}":true`);
        else if(value.startsWith('@')) code.push(`"${key}":(${value.slice(1).trim()})`);
        else code.push(`"${key}":${quote(value)}`);
    }
    return '{' + code.join(',') + '}';
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