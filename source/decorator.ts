import { DOMRenderer, DataObject, VNode, JsxChildren } from 'dom-renderer';
import {
    IReactionDisposer,
    IReactionPublic,
    autorun,
    reaction as watch
} from 'mobx';
import {
    CustomElement,
    isHTMLElementClass,
    parseJSON,
    toCamelCase,
    toHyphenCase
} from 'web-utility';

import { ClassComponent } from './WebCell';

export type PropsWithChildren<P extends DataObject = {}> = P & {
    children?: JsxChildren;
};
export type FunctionComponent<P extends DataObject = {}> = (props: P) => VNode;
export type FC<P extends DataObject = {}> = FunctionComponent<P>;

function wrapFunction<P>(func: FC<P>) {
    return (props: P) => {
        var tree: VNode,
            renderer = new DOMRenderer();

        const disposer = autorun(() => {
            const newTree = func(props);

            tree = tree ? renderer.patch(tree, newTree) : newTree;
        });
        const { unRef } = tree;

        tree.unRef = node => (disposer(), unRef?.(node));

        return tree;
    };
}

interface ReactionItem {
    expression: ReactionExpression;
    effect: Function;
}
const reactionMap = new WeakMap<CustomElement, ReactionItem[]>();

function wrapClass<T extends ClassComponent>(Component: T) {
    class ObserverComponent
        extends (Component as ClassComponent)
        implements CustomElement
    {
        protected disposers: IReactionDisposer[] = [];

        constructor() {
            super();

            const { update } = Object.getPrototypeOf(this);

            this['update'] = () =>
                this.disposers.push(autorun(() => update.call(this)));
        }

        connectedCallback() {
            const names: string[] =
                    this.constructor['observedAttributes'] || [],
                reactions = reactionMap.get(this) || [];

            this.disposers.push(
                ...names.map(name => autorun(() => this.syncPropAttr(name))),
                ...reactions.map(({ expression, effect }) =>
                    watch(
                        reaction => expression(this, reaction),
                        effect.bind(this)
                    )
                )
            );
            super['connectedCallback']?.();
        }

        disconnectedCallback() {
            for (const disposer of this.disposers) disposer();

            this.disposers.length = 0;
        }

        attributeChangedCallback(name: string, old: string, value: string) {
            this[toCamelCase(name)] = parseJSON(value);

            super['attributeChangedCallback']?.(name, old, value);
        }

        syncPropAttr(name: string) {
            var value = this[toCamelCase(name)];

            if (!(value != null) || value === false)
                return this.removeAttribute(name);

            value = value === true ? name : value;

            if (typeof value === 'object') {
                value = value.toJSON?.();

                value =
                    typeof value === 'object' ? JSON.stringify(value) : value;
            }
            super.setAttribute(name, value);
        }
    }
    return ObserverComponent as unknown as T;
}

export type WebCellComponent = FunctionComponent | ClassComponent;

/**
 * `class` decorator of Web components for MobX
 */
export function observer<T extends WebCellComponent>(
    func: T,
    _: ClassDecoratorContext
): T;
export function observer<T extends WebCellComponent>(func: T): T;
export function observer<T extends WebCellComponent>(
    func: T,
    _?: ClassDecoratorContext
) {
    return isHTMLElementClass(func) ? wrapClass(func) : wrapFunction(func);
}

/**
 * `accessor` decorator of MobX `@observable` for HTML attributes
 */
export function attribute<C extends HTMLElement, V>(
    _: ClassAccessorDecoratorTarget<C, V>,
    { name, addInitializer }: ClassAccessorDecoratorContext<C>
) {
    addInitializer(function () {
        const { constructor } = this;
        var names = constructor['observedAttributes'];

        if (!names) {
            names = [];

            Object.defineProperty(constructor, 'observedAttributes', {
                configurable: true,
                get: () => names
            });
        }
        names.push(toHyphenCase(name.toString()));
    });
}

export type ReactionExpression<I = any, O = any> = (
    data?: I,
    reaction?: IReactionPublic
) => O;

export type ReactionEffect<V> = (
    newValue: V,
    oldValue: V,
    reaction: IReactionPublic
) => any;

/**
 * Method decorator of MobX `reaction()`
 */
export function reaction<C extends HTMLElement, V>(
    expression: ReactionExpression<C, V>
) {
    return (
        effect: ReactionEffect<V>,
        { addInitializer }: ClassMethodDecoratorContext<C>
    ) =>
        addInitializer(function () {
            const reactions = reactionMap.get(this) || [];

            reactions.push({ expression, effect });

            reactionMap.set(this, reactions);
        });
}
