import React from 'react';

// A real <a href> for content mounted outside the router — DataTables cells
// get their own React root (see utils/dataTableCellRoot.js), where
// react-router's <Link> throws. Same behaviour as <Link>: a plain left click
// navigates in-app via the page's navigate(); modified clicks (new tab,
// new window) fall through to the browser.
export default function CellRootLink({ href, navigate, children, ...props }) {
    const handleClick = (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(href);
    };
    return <a href={href} onClick={handleClick} {...props}>{children}</a>;
}
