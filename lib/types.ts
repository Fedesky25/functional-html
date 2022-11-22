import type { Node } from "posthtml-parser";
import type IndexSet from "./IndexSet";

export { Node }

export type Tree = (Node|Node[])[];

export type Props = Record<string, any>;
export type Slots = Record<string, Tree>;

export type Attributes = Record<string, string|true>;
export interface SureNodeTag {
    tag: string;
    attrs?: Attributes;
    content?: Tree;
}
export type SureNode = string | SureNodeTag; 
export type FlatTree = SureNode[];

export interface SlotOptions {
    none: void;
    single: Tree;
    multiple: Record<string, Tree>;
}
export type SlotType = keyof SlotOptions

export interface Context {
    path: string;
    code: string;
    cmps: Component[];
    aliases: Map<string, number>;
    slotType: keyof SlotOptions;
}

export type ASTBuilder<S extends SlotType> = (props: Props, slots: SlotOptions[S]) => Tree;

export interface Component<S extends SlotType = SlotType> {
    ast: ASTBuilder<S>;
    slot: S;
}