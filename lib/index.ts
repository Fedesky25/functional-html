import { join as join_path, basename, dirname } from "path";
import { readFile } from "fs/promises";
import { parser, Node } from "posthtml-parser";

type Tree = (Node|Node[])[];

type Props = Record<string, any>;
type Slots = Record<string, Tree>;

interface SlotOptions {
    none: void;
    single: Tree;
    multiple: Record<string, Tree>;
}
type SlotType = keyof SlotOptions
interface HTMLComponent<S extends SlotType = SlotType> {
    (props: Props, slots: SlotOptions[S]): Tree;
    readonly slotType: S;
}
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
    slotType: keyof SlotOptions;
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

const cache = new Map<string, Promise<HTMLComponent>>();

export function componentify(path: string) {
    let c = cache.get(path);
    if(c) return c;
    c = componentFromFile(path);
    cache.set(path, c);
    return c;
}

async function componentFromFile(path: string) {
    const file = await readFile(path, "utf-8");
    return await createComponentFrom(file, path);
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
            if(template) throw Error("Multiple template definition in "+path);
            if(!Array.isArray(element.content)) throw Error(`${path} has no template content`);
            else template = element.content;
        } else if(element.attrs && element.attrs.template != null) {
            if(template) throw Error("Multiple template definition in "+path);
            delete element.attrs.template;
            template = [element];
        }
    }
    if(!template) throw Error("Missing template in "+path);
    const components = await Promise.all(cctx.tasks);
    const aliases = new Map(components);
    const ctx: Context = { code: '', path, aliases, slotType: "none" };
    const returnExpression = walk(template, ctx);
    const fn = new Function("props", "slots", "$components", `const {${cctx.props.join(',')}} = props; ${ctx.code}; return ${returnExpression}`);
    const res = (props: Props, slots: Slots) => fn(props, slots, aliases);
    Object.defineProperty(res, "slotType", { value: ctx.slotType, writable: false });
    return res as HTMLComponent;
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
    const def = node.content ? walk(node.content, ctx) : "null";
    const name = node.attrs && node.attrs.name;
    if(ctx.slotType === "none") {
        if(name) {
            ctx.slotType = "multiple";
            return `(slots["${name}"] || ${def})`;
        }
        else {
            ctx.slotType = "single";
            return `(slots || ${def})`;
        }
    }
    if(ctx.slotType === "single") throw Error(`There cannot be more than one (unnamed) slot: consider using named slots (${ctx.path})`);
    if(!name) throw Error("Slots must have a name in "+ctx.path);
    return `(slots["${name}"] || ${def})`;
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

function readFragementOrTag(node: SureNodeTag, frag_def: string, rem_attr: string, ctx: Context) {
    if(node.tag === "fragment") return node.content ? walk(node.content, ctx) : frag_def;
    node.attrs && (delete node.attrs[rem_attr]);
    return normalTag(node, ctx);
}

function conditionalClause(this: void, node: SureNodeTag, ctx: Context) {
    if(!node.content) throw Error("Missing conditional clause body");
    const cases = flatten(node.content);
    const len = cases.length;
    let item: SureNode;
    let code = '';
    let _else = false;
    let condition: string | true;

    for(var i=0; i<len && !_else; i++) {
        item = cases[i];
        if(typeof item === "string") {
            if(!spaceRegExp.test(item)) console.warn(`String "${item}" inside conditional tag is skipped (at ${ctx.path})`);
            continue;
        }
        if(!item.attrs) throw Error("No if or else attribute on child of conditional in "+ctx.path);
        _else = "else" in item.attrs;
        if(_else) {
            if(i+1 < len) console.warn("else in conditinal must be the last node child in "+ctx.path);
            code += readFragementOrTag(item, "null", "else", ctx);
            continue
        }
        condition = item.attrs.if;
        if(typeof condition !== "string" || condition.length === 0) throw Error(`Missing if attribute inside conditional (at ${ctx.path})`);
        code += `(${condition})?${readFragementOrTag(item, "null", "if", ctx)}:`;
    }
    if(code.length === 0) console.warn(`Missing conditional content in ${ctx.path}`);
    if(!_else) code += "null";
    return code;
}

function handleImport(this: void, node: SureNodeTag, ctx: Context) {
    const name = node.tag;
    const content = node.content;
    const type = (ctx.aliases.get(name) as HTMLComponent).slotType;
    const code = type === "multiple" 
    ? handleImportWithMultiple(content, name, ctx) 
    : type === "single" 
    ? (content ? walk(content, ctx) : "null") 
    : (content && content.length > 0 && content[0] !== '' && console.warn(`${name} component has no slot: skipping its content in ${ctx.path}`), "null");
    const props = node.attrs ? readProps(node.attrs) : "{}";
    return `$components.get("${name}")(${props},${code})`;
}

function handleImportWithMultiple(_content: Tree | undefined, alias: string, ctx: Context) {
    if(!_content) return "{}";
    let code = '{';
    const content = flatten(_content);
    const len = content.length;
    const slots = new Set<string>();
    let item: SureNode;
    let name: string|true;
    for(var i=0; i<len; i++) {
        item = content[i];
        if(typeof item === "string") {
            if(!spaceRegExp.test(item)) console.warn(`Text "${item}" inside ${alias} component call is skipped (at ${ctx.path})`);
            continue;
        }
        if(!item.attrs) throw Error(`Direct children of component (${alias}) must specify slot attribute (at ${ctx.path})`);
        name = item.attrs.slot;
        if(name == null || name === true) throw Error(`Direct children of component (${alias}) must specify slot attribute (at ${ctx.path})`);
        if(slots.has(name)) throw Error(`Slots cannot be defined more than once: ${name} inside ${alias} in ${ctx.path}`);
        if(slots.size) code += ',';
        slots.add(name);
        code += `"${name}":${readFragementOrTag(item, "[]", "slot", ctx)}`;
    }
    return code + '}';
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
const slashRegExp = /\\/g;
function quote(str: string) {
    str = str.replace(slashRegExp, "\\\\");
    if(str.indexOf("${") === -1) return '"' + str.replace(quote1RegExp, '\\"') + '"';
    else return '`' + str.replace(quote2RegExp, '\\`') + '`';
}