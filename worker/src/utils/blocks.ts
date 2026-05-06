import { BlockData } from '../types/env';

/**
 * WordPress-compatible Gutenberg block parser
 * Parses <!-- wp:block-name {...attrs} --> ... <!-- /wp:block-name --> syntax
 */
export function parseBlocks(content: string): BlockData[] {
  const blocks: BlockData[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    const block = parseNextBlock(remaining);
    if (!block) break;
    blocks.push(block.block);
    remaining = remaining.slice(block.offset);
  }

  return blocks;
}

interface ParseResult {
  block: BlockData;
  offset: number;
}

function parseNextBlock(content: string): ParseResult | null {
  // Match opening block comment: <!-- wp:name {attrs} -->  or <!-- wp:name -->
  const openRe = /<!--\s+wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)(\s+({[^}]*}))?\s+(\/)?-->/;
  const match = openRe.exec(content);

  if (!match) {
    // Freeform text block
    if (content.trim()) {
      return {
        block: {
          blockName: 'core/freeform',
          attrs: {},
          innerBlocks: [],
          innerHTML: content,
          innerContent: [content]
        },
        offset: content.length
      };
    }
    return null;
  }

  const beforeBlock = content.slice(0, match.index);
  let offset = match.index + match[0].length;

  const blockName = match[1].includes('/') ? match[1] : `core/${match[1]}`;
  let attrs: Record<string, unknown> = {};
  if (match[3]) {
    try { attrs = JSON.parse(match[3]); } catch {}
  }

  const isSelfClosing = match[4] === '/';

  // Handle freeform content before block
  if (beforeBlock.trim()) {
    // Will be handled in outer loop
  }

  if (isSelfClosing) {
    return {
      block: {
        blockName,
        attrs,
        innerBlocks: [],
        innerHTML: '',
        innerContent: []
      },
      offset
    };
  }

  // Find closing tag
  const closeTag = `<!-- /wp:${match[1]} -->`;
  const closeIdx = content.indexOf(closeTag, offset);

  if (closeIdx === -1) {
    // No closing tag; treat rest as content
    const innerHTML = content.slice(offset);
    return {
      block: {
        blockName,
        attrs,
        innerBlocks: parseBlocks(innerHTML),
        innerHTML,
        innerContent: [innerHTML]
      },
      offset: content.length
    };
  }

  const innerHTML = content.slice(offset, closeIdx);
  const innerBlocks = parseBlocks(innerHTML);

  return {
    block: {
      blockName,
      attrs,
      innerBlocks,
      innerHTML,
      innerContent: [innerHTML]
    },
    offset: closeIdx + closeTag.length
  };
}

/**
 * Render blocks to HTML (server-side rendering)
 */
export function renderBlocks(blocks: BlockData[], context: RenderContext = {}): string {
  return blocks.map(block => renderBlock(block, context)).join('');
}

export interface RenderContext {
  postId?: number;
  siteUrl?: string;
  themeUrl?: string;
  isEditor?: boolean;
}

export function renderBlock(block: BlockData, ctx: RenderContext = {}): string {
  const renderer = blockRenderers[block.blockName];
  if (renderer) return renderer(block, ctx);
  
  // Fallback: render innerHTML with inner blocks substituted
  if (block.innerBlocks.length > 0) {
    return block.innerHTML;
  }
  return block.innerHTML;
}

type BlockRenderer = (block: BlockData, ctx: RenderContext) => string;

const blockRenderers: Record<string, BlockRenderer> = {
  // ─── Core blocks ──────────────────────────────────────────────────
  'core/paragraph': ({ attrs, innerHTML }) => {
    const align = (attrs.align as string) || '';
    const style = align ? ` class="has-text-align-${align}"` : '';
    const dropCap = attrs.dropCap ? ' class="has-drop-cap"' : '';
    return `<p${style}${dropCap}>${stripBlockComments(innerHTML)}</p>`;
  },

  'core/heading': ({ attrs, innerHTML }) => {
    const level = (attrs.level as number) || 2;
    const align = (attrs.textAlign as string) || '';
    const cls = align ? ` class="has-text-align-${align}"` : '';
    const content = stripBlockComments(innerHTML);
    return `<h${level}${cls}>${content}</h${level}>`;
  },

  'core/image': ({ attrs }) => {
    const { url, alt, caption, align, width, height, className, id, sizeSlug, linkDestination, href } = attrs as Record<string, string | number>;
    const cls = ['wp-block-image', align ? `align${align}` : '', sizeSlug ? `size-${sizeSlug}` : '', className || ''].filter(Boolean).join(' ');
    const imgAttrs = [
      `src="${url || ''}"`,
      `alt="${alt || ''}"`,
      width ? `width="${width}"` : '',
      height ? `height="${height}"` : '',
      id ? `class="wp-image-${id}"` : ''
    ].filter(Boolean).join(' ');
    
    const img = `<img ${imgAttrs}/>`;
    const linked = href ? `<a href="${href}">${img}</a>` : img;
    const fig = caption ? `<figure class="${cls}">${linked}<figcaption>${caption}</figcaption></figure>` : `<figure class="${cls}">${linked}</figure>`;
    return fig;
  },

  'core/gallery': ({ attrs, innerBlocks }, ctx) => {
    const { columns = 3, linkTo = 'none', className = '' } = attrs as Record<string, string | number>;
    const cls = ['wp-block-gallery', `has-nested-images`, `columns-${columns}`, className].filter(Boolean).join(' ');
    const items = innerBlocks.map(b => renderBlock(b, ctx)).join('');
    return `<figure class="${cls}">${items}</figure>`;
  },

  'core/list': ({ attrs, innerHTML }) => {
    const ordered = attrs.ordered;
    const tag = ordered ? 'ol' : 'ul';
    const cls = ordered ? ' class="wp-block-list"' : ' class="wp-block-list"';
    const content = stripBlockComments(innerHTML);
    return `<${tag}${cls}>${content}</${tag}>`;
  },

  'core/list-item': ({ innerHTML }) => {
    return `<li>${stripBlockComments(innerHTML)}</li>`;
  },

  'core/quote': ({ attrs, innerBlocks, innerHTML }, ctx) => {
    const citation = attrs.citation as string || '';
    const inner = innerBlocks.length ? renderBlocks(innerBlocks, ctx) : stripBlockComments(innerHTML);
    const cite = citation ? `<cite>${citation}</cite>` : '';
    return `<blockquote class="wp-block-quote">${inner}${cite}</blockquote>`;
  },

  'core/pullquote': ({ attrs, innerHTML }) => {
    const value = attrs.value as string || '';
    const citation = attrs.citation as string || '';
    return `<figure class="wp-block-pullquote"><blockquote><p>${value}</p>${citation ? `<cite>${citation}</cite>` : ''}</blockquote></figure>`;
  },

  'core/code': ({ attrs, innerHTML }) => {
    const content = stripBlockComments(innerHTML);
    return `<pre class="wp-block-code"><code>${content}</code></pre>`;
  },

  'core/preformatted': ({ innerHTML }) => {
    return `<pre class="wp-block-preformatted">${stripBlockComments(innerHTML)}</pre>`;
  },

  'core/html': ({ innerHTML }) => innerHTML,
  'core/freeform': ({ innerHTML }) => innerHTML,

  'core/separator': ({ attrs }) => {
    const cls = ['wp-block-separator', attrs.className as string || ''].filter(Boolean).join(' ');
    return `<hr class="${cls}"/>`;
  },

  'core/spacer': ({ attrs }) => {
    const height = attrs.height || 100;
    return `<div class="wp-block-spacer" style="height:${height}px" aria-hidden="true"></div>`;
  },

  'core/buttons': ({ innerBlocks }, ctx) => {
    const items = renderBlocks(innerBlocks, ctx);
    return `<div class="wp-block-buttons">${items}</div>`;
  },

  'core/button': ({ attrs }) => {
    const { url = '#', text = '', backgroundColor, textColor, className = '', borderRadius, width } = attrs as Record<string, string | number>;
    const style: string[] = [];
    if (backgroundColor) style.push(`background-color:${backgroundColor}`);
    if (textColor) style.push(`color:${textColor}`);
    if (borderRadius !== undefined) style.push(`border-radius:${borderRadius}px`);
    const styleStr = style.length ? ` style="${style.join(';')}"` : '';
    const cls = ['wp-block-button__link', className].filter(Boolean).join(' ');
    const widthCls = width ? ` has-custom-width wp-block-button__width-${width}` : '';
    return `<div class="wp-block-button${widthCls}"><a class="${cls}" href="${url}"${styleStr}>${text}</a></div>`;
  },

  'core/columns': ({ innerBlocks }, ctx) => {
    const cols = renderBlocks(innerBlocks, ctx);
    return `<div class="wp-block-columns">${cols}</div>`;
  },

  'core/column': ({ attrs, innerBlocks }, ctx) => {
    const width = attrs.width ? ` style="flex-basis:${attrs.width}"` : '';
    const inner = renderBlocks(innerBlocks, ctx);
    return `<div class="wp-block-column"${width}>${inner}</div>`;
  },

  'core/group': ({ attrs, innerBlocks }, ctx) => {
    const { backgroundColor, textColor, className = '', layout } = attrs as Record<string, string>;
    const style: string[] = [];
    if (backgroundColor) style.push(`background-color:${backgroundColor}`);
    if (textColor) style.push(`color:${textColor}`);
    const styleStr = style.length ? ` style="${style.join(';')}"` : '';
    const cls = ['wp-block-group', className].filter(Boolean).join(' ');
    const inner = renderBlocks(innerBlocks, ctx);
    return `<div class="${cls}"${styleStr}>${inner}</div>`;
  },

  'core/cover': ({ attrs, innerBlocks }, ctx) => {
    const { url, dimRatio = 50, overlayColor, minHeight, className = '' } = attrs as Record<string, string | number>;
    const style = [`background-image:url(${url})`, minHeight ? `min-height:${minHeight}px` : ''].filter(Boolean).join(';');
    const cls = ['wp-block-cover', className].filter(Boolean).join(' ');
    const inner = renderBlocks(innerBlocks, ctx);
    return `<div class="${cls}" style="${style}"><div class="wp-block-cover__overlay has-background-dim-${dimRatio}"></div><div class="wp-block-cover__inner-container">${inner}</div></div>`;
  },

  'core/media-text': ({ attrs, innerBlocks }, ctx) => {
    const { mediaUrl, mediaAlt = '', mediaType = 'image', isStackedOnMobile, className = '' } = attrs as Record<string, string | boolean>;
    const stacked = isStackedOnMobile ? ' is-stacked-on-mobile' : '';
    const cls = `wp-block-media-text${stacked} ${className}`.trim();
    const media = mediaType === 'image' ? `<img src="${mediaUrl}" alt="${mediaAlt}" class="wp-block-media-text__media"/>` : `<video src="${mediaUrl}" class="wp-block-media-text__media"></video>`;
    const inner = renderBlocks(innerBlocks, ctx);
    return `<div class="${cls}"><figure class="wp-block-media-text__media">${media}</figure><div class="wp-block-media-text__content">${inner}</div></div>`;
  },

  'core/table': ({ attrs, innerHTML }) => {
    const { className = '', hasFixedLayout } = attrs as Record<string, string | boolean>;
    const cls = ['wp-block-table', hasFixedLayout ? 'is-style-stripes' : '', className].filter(Boolean).join(' ');
    return `<figure class="${cls}"><table>${stripBlockComments(innerHTML)}</table></figure>`;
  },

  'core/video': ({ attrs }) => {
    const { src, caption, controls = true, loop, muted, playsInline, poster, preload } = attrs as Record<string, string | boolean>;
    const attrs2 = [
      controls ? 'controls' : '', loop ? 'loop' : '', muted ? 'muted' : '',
      playsInline ? 'playsinline' : '', poster ? `poster="${poster}"` : '',
      preload ? `preload="${preload}"` : ''
    ].filter(Boolean).join(' ');
    return `<figure class="wp-block-video"><video src="${src}" ${attrs2}></video>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  },

  'core/audio': ({ attrs }) => {
    const { src, caption, autoplay, loop, preload = 'none' } = attrs as Record<string, string | boolean>;
    const a = [autoplay ? 'autoplay' : '', loop ? 'loop' : '', `preload="${preload}"`].filter(Boolean).join(' ');
    return `<figure class="wp-block-audio"><audio src="${src}" ${a}></audio>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  },

  'core/embed': ({ attrs }) => {
    const { url, caption, providerNameSlug } = attrs as Record<string, string>;
    return `<figure class="wp-block-embed is-type-video is-provider-${providerNameSlug || 'video'}"><div class="wp-block-embed__wrapper"><iframe src="${url}" allowfullscreen></iframe></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  },

  'core/shortcode': ({ attrs, innerHTML }) => {
    return `<!-- shortcode: ${stripBlockComments(innerHTML)} -->`;
  },

  'core/block': ({ attrs }) => {
    return `<!-- reusable block: ${attrs.ref} -->`;
  },

  'core/more': () => `<span id="more-1"></span>`,

  'core/nextpage': () => `<!--nextpage-->`,

  'core/tag-cloud': ({ attrs }) => {
    return `<div class="wp-block-tag-cloud"></div>`;
  },

  'core/categories': ({ attrs }) => {
    return `<ul class="wp-block-categories-list"></ul>`;
  },

  'core/latest-posts': ({ attrs }) => {
    return `<ul class="wp-block-latest-posts__list"></ul>`;
  },

  'core/latest-comments': ({ attrs }) => {
    return `<ul class="wp-block-latest-comments"></ul>`;
  },

  'core/archives': ({ attrs }) => {
    return `<ul class="wp-block-archives-list"></ul>`;
  },

  'core/search': ({ attrs }) => {
    const { label = 'Search', placeholder = '', buttonText = 'Search' } = attrs as Record<string, string>;
    return `<div class="wp-block-search"><form role="search" method="get" action="/"><label class="wp-block-search__label">${label}</label><input type="search" class="wp-block-search__input" name="s" placeholder="${placeholder}"/><button class="wp-block-search__button">${buttonText}</button></form></div>`;
  },

  'core/social-links': ({ innerBlocks }, ctx) => {
    const items = renderBlocks(innerBlocks, ctx);
    return `<ul class="wp-block-social-links">${items}</ul>`;
  },

  'core/social-link': ({ attrs }) => {
    const { service = '', url = '', label } = attrs as Record<string, string>;
    return `<li class="wp-social-link wp-social-link-${service}"><a href="${url}" aria-label="${label || service}"><span class="wp-block-social-link-label screen-reader-text">${label || service}</span></a></li>`;
  },

  'core/navigation': ({ attrs, innerBlocks }, ctx) => {
    const items = renderBlocks(innerBlocks, ctx);
    return `<nav class="wp-block-navigation"><ul class="wp-block-navigation__container">${items}</ul></nav>`;
  },

  'core/navigation-link': ({ attrs, innerBlocks }, ctx) => {
    const { url = '#', label = '', isTopLevelLink } = attrs as Record<string, string | boolean>;
    const submenu = innerBlocks.length ? `<ul class="wp-block-navigation__submenu-container">${renderBlocks(innerBlocks, ctx)}</ul>` : '';
    return `<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="${url}">${label}</a>${submenu}</li>`;
  },

  'core/site-title': ({ attrs }, ctx) => {
    return `<div class="wp-block-site-title"><a href="${ctx.siteUrl || '/'}" rel="home">${attrs.isLink ? '' : ''}</a></div>`;
  },

  'core/site-logo': ({ attrs }, ctx) => {
    return `<div class="wp-block-site-logo"></div>`;
  },

  'core/post-title': ({ attrs }) => {
    const level = (attrs.level as number) || 1;
    return `<h${level} class="wp-block-post-title"></h${level}>`;
  },

  'core/post-content': ({ innerBlocks }, ctx) => {
    return `<div class="entry-content wp-block-post-content">${renderBlocks(innerBlocks, ctx)}</div>`;
  },

  'core/post-excerpt': () => `<div class="wp-block-post-excerpt"></div>`,
  'core/post-date': ({ attrs }) => `<div class="wp-block-post-date"></div>`,
  'core/post-featured-image': ({ attrs }) => `<div class="wp-block-post-featured-image"></div>`,
  'core/post-author': () => `<div class="wp-block-post-author"></div>`,

  'core/template-part': ({ attrs }) => `<!-- template-part: ${attrs.slug} -->`,

  'core/verse': ({ innerHTML }) => `<pre class="wp-block-verse">${stripBlockComments(innerHTML)}</pre>`,

  'core/details': ({ attrs, innerBlocks }, ctx) => {
    const summary = attrs.summary as string || '';
    const inner = renderBlocks(innerBlocks, ctx);
    return `<details class="wp-block-details"><summary>${summary}</summary>${inner}</details>`;
  },
};

function stripBlockComments(html: string): string {
  return html.replace(/<!--\s*wp:[^>]*-->/g, '').replace(/<!--\s*\/wp:[^>]*-->/g, '').trim();
}

/**
 * Serialize blocks back to WordPress block comment format
 */
export function serializeBlocks(blocks: BlockData[]): string {
  return blocks.map(serializeBlock).join('\n');
}

export function serializeBlock(block: BlockData): string {
  if (block.blockName === 'core/freeform') return block.innerHTML;

  const name = block.blockName.startsWith('core/') ? block.blockName.replace('core/', '') : block.blockName;
  const attrsStr = Object.keys(block.attrs).length ? ' ' + JSON.stringify(block.attrs) : '';

  if (!block.innerBlocks.length && !block.innerHTML.trim()) {
    return `<!-- wp:${name}${attrsStr} /-->`;
  }

  const inner = block.innerBlocks.length ? serializeBlocks(block.innerBlocks) : block.innerHTML;
  return `<!-- wp:${name}${attrsStr} -->\n${inner}\n<!-- /wp:${name} -->`;
}
