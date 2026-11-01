import PageHead from './PageHead';

/** Landing page of Scan reports: nothing is preselected, the user picks a report type in the left list. */
export default function SelectReport() {
    return (
        <div className="flex flex-col gap-3.5">
            <PageHead title="Scan reports" sub="Latest report of each scanner" />
            <div className="sheet px-4 py-10 text-center text-xs" style={{ color: 'var(--mute)' }}>Choose a report type from the list on the left.</div>
        </div>
    );
}
