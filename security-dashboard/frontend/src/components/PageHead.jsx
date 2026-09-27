export default function PageHead({ eyebrow, title, sub, children }) {
    return (
        <div className="shrink-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <div className="flex items-baseline gap-4 mt-0.5 flex-wrap">
                <h1 className="page-title">{title}</h1>
                {sub && <span className="page-sub">{sub}</span>}
                <div className="flex-1" />
                {children && <div className="flex items-center gap-2 self-center">{children}</div>}
            </div>
        </div>
    );
}
