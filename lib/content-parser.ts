import type { Attributes, Context, FlatTree, SureNode, SureNodeTag, Tree, Node } from "./types";

const lineRegExp = /\s*\n\s*/g;
const spaceRegExp = /^\s*$/;

export function walk(this: void, tree: Tree, ctx: Context) {
    const flat = flatten(tree);
    const len = flat.length;
    const code: string[] = [];
    let node: SureNode;
    for(var i=0; i<len; i++) {
        node = flat[i];
        if(typeof node === "string") {
            node = node.replace(lineRegExp, ' ');
            if(node !== ' ') code.push(quote(node));
        }
        else code.push(dispatchNodeTag(node, ctx));
    }
    return '[' + code.join(',') + ']'
}

export function dispatchNodeTag(node: SureNodeTag, ctx: Context) {
    const tag = node.tag;
    switch(tag) {
        case "slot": return handleSlot(node, ctx);
        case "each": return eachClause(node, ctx);
        case "conditional": return conditionalClause(node, ctx);
        case "dyn": return dynamicTag(node, ctx);
    }
    const component_index = ctx.aliases.get(tag);
    if(component_index !== undefined) return handleImport(node, component_index, ctx);
    return normalTag(node, ctx);
}

function dispatchNodeTagOrFragment(node: SureNodeTag, fragmentDefault: string, removeAttr: string, ctx: Context) {
    if(node.tag === "fragment") return node.content ? walk(node.content, ctx) : fragmentDefault;
    node.attrs && (delete node.attrs[removeAttr]);
    return dispatchNodeTag(node, ctx);
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
    const arrayName = attrs.array || attrs.of;
    if(arrayName == null || arrayName === true || arrayName.length === 0) throw Error("Name of array is missing in each clause in "+ctx.path);
    let itemName = attrs.item;
    if(itemName == null) {
        itemName = "_";
        console.warn("Item is unused in each clause in "+ctx.path);
    }
    else if(itemName === true) itemName = "item";
    let indexName = attrs.index;
    if(indexName === true) indexName = "index";
    return `${arrayName}.map((${itemName}${indexName ? ','+indexName : ''})=>(${walk(body,ctx)}))`;
}

function conditionalClause(this: void, node: SureNodeTag, ctx: Context) {
    if(!node.content) throw Error("Missing conditional clause body");
    const cases = flatten(node.content);
    const len = cases.length;
    let item: SureNode;
    let code = '';
    let _else = false;
    let condition: string | true;

    for(var i=0; i<len; i++) {
        item = cases[i];
        if(typeof item === "string") {
            if(!spaceRegExp.test(item)) console.warn(`String "${item}" inside conditional tag is skipped (at ${ctx.path})`);
            continue;
        }
        if(!item.attrs) throw Error("No if or else attribute on child of conditional in "+ctx.path);
        if(_else = ("else" in item.attrs)) {
            if(i+1 < len) console.warn("else in conditinal must be the last node child in "+ctx.path);
            code += dispatchNodeTagOrFragment(item, "null", "else", ctx);
            break;
        }
        condition = item.attrs.if;
        if(typeof condition !== "string" || condition.length === 0) throw Error(`Missing if attribute inside conditional (at ${ctx.path})`);
        code += `(${condition})?${dispatchNodeTagOrFragment(item, "null", "if", ctx)}:`;
    }
    if(code.length === 0) console.warn(`Missing conditional content in ${ctx.path}`);
    if(!_else) code += "null";
    return code;
}

function dynamicTag(this: void, node: SureNodeTag, ctx: Context) {
    const attrs = node.attrs;
    if(!attrs || !attrs.tag) throw Error("Missing tag attribute in dyn node in "+ctx.path);
    let res = `{tag: (${attrs.tag})`;
    delete attrs.tag;
    if(!isEmpty(attrs)) res += ",attrs:" + readAttrs(attrs);
    if(node.content) res += ",content:" + walk(node.content, ctx);
    return res + '}';
}

function handleImport(this: void, node: SureNodeTag, index: number, ctx: Context) {
    const name = node.tag;
    const content = node.content;
    const type = ctx.cmps[index].slot;
    const code = type === "multiple" 
    ? handleImportWithMultiple(content, name, ctx) 
    : type === "single" 
    ? (content ? walk(content, ctx) : "null") 
    : (content && content.length > 0 && content[0] !== '' && console.warn(`${name} component has no slot: skipping its content in ${ctx.path}`), "null");
    const props = node.attrs ? readProps(node.attrs) : "{}";
    return `$components[${index}].ast(${props},${code})`;
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
        code += `"${name}":${dispatchNodeTagOrFragment(item, "[]", "slot", ctx)}`;
    }
    return code + '}';
}

function normalTag(this: void, node: SureNodeTag, ctx: Context) {
    let res = `{tag:"${node.tag}"`;
    if(node.attrs) res += ",attrs:" + readAttrs(node.attrs);
    if(node.content) res +=  ",content:" + walk(node.content, ctx);
    return res + '}';
}

function readAttrs(this: void, attrs: Attributes) {
    let value: string|true;
    const code: string[] = [];
    const classAttr = attrs.class
    let className = (classAttr === true || classAttr == undefined) ? "" : classAttr;
    delete attrs.class;
    for(var key in attrs) {
        value = attrs[key];
        if(key.startsWith("class:")) {
            const name = key.slice(6);
            const condition = value === true ? name : value;
            className += `\${(${condition}) ? "${className.length ? ' ' : ''}${name}" : ""}`;
        }
        else code.push(`"${key}":${value === true ? value : quote(value)}`);
    }
    if(className.length) code.push(`"class": ${quote(className)}||false`);
    else if(classAttr === true) code.push('"class":true');
    return '{' + code.join(',') + '}';
}

function readProps(this: void, attrs: Attributes) {
    let value: string|true;
    const code: string[] = [];
    const spread = attrs["f:spread"];
    delete attrs["f:spread"];
    for(var key in attrs) {
        value = attrs[key];
        if(value === true) code.push(`"${key}":true`);
        else if(value.startsWith('@')) code.push(`"${key}":(${value.slice(1).trim()})`);
        else code.push(`"${key}":${quote(value)}`);
    }
    if(code.length === 0) return spread ? spread : "{}";
    return '{' + code.join(',') + (spread ? "..." + spread : '') + '}';
}

export function flatten(tree: Tree) {
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

function isEmpty(obj: Object) {
    for(var key in obj) return false;
    return true;
}