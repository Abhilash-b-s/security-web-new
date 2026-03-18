import { useState, useEffect } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
    Shield, AlertTriangle, Package, Globe, Image as ImageIcon,
    ShieldOff, Play, GitBranch, Server, Activity, Wifi
} from 'lucide-react';

const COLORS = {
    CRITICAL: '#EF4444',
    HIGH: '#F97316',
    MEDIUM: '#EAB308',
    LOW: '#14B8A6',
    UNKNOWN: '#6B7280',
    PASS: '#10B981',
    FAIL: '#EF4444',
    WARN: '#F59E0B',
    ERROR: '#EF4444',
    SKIP: '#6B7280',
    INFO: '#6B7280',
};

const CHART_THEME = {
    light: {
        grid: '#E5E7EB',
        axis: '#6B7280',
        tooltipBg: 'rgba(255,255,255,0.98)',
        tooltipBorder: '#D1D5DB',
        tooltipText: '#111827',
    },
    dark: {
        grid: '#374151',
        axis: '#9CA3AF',
        tooltipBg: '#1e293b',
        tooltipBorder: '#475569',
        tooltipText: '#F1F5F9',
    },
};

function useIsDark() {
    const [isDark, setIsDark] = useState(() =>
        document.documentElement.classList.contains('dark')
    );
    useEffect(() => {
        const observer = new MutationObserver(() =>
            setIsDark(document.documentElement.classList.contains('dark'))
        );
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

function computeSecurityScore(data) {
    const scores = [];
    if (data.kyverno.available && data.kyverno.total > 0) {
        const pass = data.kyverno.counts.PASS || 0;
        scores.push((pass / data.kyverno.total) * 100);
    }
    if (data.kubebench.available && data.kubebench.total > 0) {
        const pass = data.kubebench.counts.PASS || 0;
        scores.push((pass / data.kubebench.total) * 100);
    }
    if (data.trivyImage.available && data.trivyImage.total > 0) {
        const critical = data.trivyImage.counts.CRITICAL || 0;
        const high = data.trivyImage.counts.HIGH || 0;
        scores.push(Math.max(0, 100 - Math.min(100, critical * 5 + high)));
    }
    if (data.cluster.available && data.cluster.total > 0) {
        const critical = data.cluster.counts.CRITICAL || 0;
        const high = data.cluster.counts.HIGH || 0;
        scores.push(Math.max(0, 100 - Math.min(100, critical * 5 + high)));
    }
    if (data.nmap.available && data.nmap.total > 0) {
        const weakPct = (data.nmap.servicesWithWeakCiphers / data.nmap.total) * 100;
        scores.push(Math.max(0, 100 - weakPct));
    }
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Returns hex colors — immune to Tailwind purge
function getScoreStyle(score) {
    if (score >= 80) return { color: '#10B981', bg: '#10B981', label: 'Good' };
    if (score >= 60) return { color: '#F59E0B', bg: '#F59E0B', label: 'Fair' };
    if (score >= 40) return { color: '#F97316', bg: '#F97316', label: 'Poor' };
    return { color: '#EF4444', bg: '#EF4444', label: 'Critical' };
}

function rateColor(rate) {
    if (rate === null) return '#6B7280';
    if (rate >= 80) return '#10B981';
    if (rate >= 60) return '#F59E0B';
    return '#EF4444';
}

function KpiCard({ icon: Icon, title, value, subtitle, valueColor, iconColor, iconBg }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
                <div className={`p-2 rounded-lg ${iconBg}`}>
                    <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>
            </div>
            <p className="text-3xl font-medium mb-1" style={{ color: valueColor }}>{value}</p>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
    );
}

function DonutChart({ data, centerValue, centerLabel, height = 200 }) {
    const isDark = useIsDark();
    const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
    return (
        <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={height}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={height * 0.27}
                        outerRadius={height * 0.40}
                        dataKey="value"
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                    >
                        {data.map((entry, i) => (
                            <Cell key={i} fill={COLORS[entry.name] || '#6B7280'} stroke="none" />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: theme.tooltipBg,
                            border: `1px solid ${theme.tooltipBorder}`,
                            borderRadius: '8px',
                            color: theme.tooltipText,
                            fontSize: '12px',
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            {centerValue !== undefined && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none',
                }}>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{centerValue}</div>
                    {centerLabel && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{centerLabel}</div>}
                </div>
            )}
        </div>
    );
}

function SeverityLegend({ data }) {
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-1">
            {data.map(entry => (
                <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[entry.name] || '#6B7280' }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.name}: <span className="font-semibold text-gray-700 dark:text-gray-300">{entry.value}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

function ComplianceBar({ label, count, total, color }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{count} <span className="font-normal text-gray-400">({pct}%)</span></span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

export default function DashboardCharts() {
    const isDark = useIsDark();
    const theme = isDark ? CHART_THEME.dark : CHART_THEME.light;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dashboardData, setDashboardData] = useState({
        kyverno: { counts: {}, total: 0, available: false },
        trivyImage: { counts: {}, total: 0, available: false },
        trivySbom: { counts: {}, total: 0, available: false },
        trivyRepo: { counts: {}, total: 0, available: false },
        nmap: { total: 0, servicesWithWeakCiphers: 0, available: false },
        kubebench: { counts: {}, total: 0, available: false },
        cluster: { counts: {}, total: 0, available: false },
    });

    useEffect(() => { loadAllData(); }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/stats');
            if (!res.ok) throw new Error('Failed to load dashboard data');
            setDashboardData(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading security data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    <div>
                        <h3 className="font-bold text-yellow-800 dark:text-yellow-300">Dashboard Unavailable</h3>
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">Run scans to generate reports and view visualizations.</p>
                    </div>
                </div>
            </div>
        );
    }

    const hasAnyData = Object.values(dashboardData).some(v => v.available === true);
    if (!hasAnyData) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[480px] text-center px-6">
                <div className="p-5 bg-slate-100 dark:bg-gray-800 rounded-2xl mb-5 border border-slate-200 dark:border-gray-700">
                    <ShieldOff className="w-12 h-12 text-slate-400 dark:text-gray-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">No scan data yet</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400 max-w-xs mb-6 leading-relaxed">
                    Run your first scan from the sidebar to see security insights, vulnerability breakdowns, and compliance status here.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs max-w-sm w-full">
                    {[
                        { label: 'Image Vulnerabilities', hint: 'Container CVE scan' },
                        { label: 'Policy Compliance', hint: 'Kyverno policies' },
                        { label: 'CIS Benchmarks', hint: 'Cluster hardening' },
                        { label: 'Network Security', hint: 'Port & cipher scan' },
                    ].map(item => (
                        <div key={item.label} className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-left">
                            <Play className="w-3 h-3 text-blue-500 flex-shrink-0" />
                            <div>
                                <div className="font-medium text-slate-600 dark:text-gray-300">{item.label}</div>
                                <div className="text-slate-400 dark:text-gray-400">{item.hint}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Derived values ───────────────────────────────────────────────────────

    const securityScore = computeSecurityScore(dashboardData);
    const scoreStyle = securityScore !== null ? getScoreStyle(securityScore) : null;

    const totalCritical =
        (dashboardData.trivyImage.counts.CRITICAL || 0) +
        (dashboardData.trivySbom.counts.CRITICAL || 0) +
        (dashboardData.trivyRepo.counts.CRITICAL || 0) +
        (dashboardData.cluster.counts.CRITICAL || 0);

    const policyPassRate = dashboardData.kyverno.available && dashboardData.kyverno.total > 0
        ? Math.round(((dashboardData.kyverno.counts.PASS || 0) / dashboardData.kyverno.total) * 100)
        : null;

    const cisPassRate = dashboardData.kubebench.available && dashboardData.kubebench.total > 0
        ? Math.round(((dashboardData.kubebench.counts.PASS || 0) / dashboardData.kubebench.total) * 100)
        : null;

    const policyColor = rateColor(policyPassRate);
    const cisColor = rateColor(cisPassRate);

    // Vulnerability breakdown — raw counts per scan type
    const vulnBreakdownData = [
        { name: 'Image',   key: 'trivyImage', Icon: ImageIcon, iconColor: '#F87171' },
        { name: 'SBOM',    key: 'trivySbom',  Icon: Package,   iconColor: '#FB923C' },
        { name: 'Repo',    key: 'trivyRepo',  Icon: GitBranch, iconColor: '#C084FC' },
        { name: 'Cluster', key: 'cluster',    Icon: Globe,     iconColor: '#60A5FA' },
    ]
        .filter(({ key }) => dashboardData[key].available)
        .map(({ name, key, Icon, iconColor }) => ({
            name, Icon, iconColor,
            counts: dashboardData[key].counts,
            total: dashboardData[key].total,
        }));

    // Donut chart data
    const imagePieData = Object.entries(dashboardData.trivyImage.counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const sbomPieData = Object.entries(dashboardData.trivySbom.counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const repoPieData = Object.entries(dashboardData.trivyRepo.counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const clusterPieData = Object.entries(dashboardData.cluster.counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const policyPieData = Object.entries(dashboardData.kyverno.counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

    const tooltipProps = {
        contentStyle: {
            backgroundColor: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            borderRadius: '8px',
            color: theme.tooltipText,
            fontSize: '12px',
        },
        labelStyle: { color: theme.tooltipText },
        itemStyle: { color: theme.tooltipText },
    };

    return (
        <div className="space-y-5">

            {/* ── Row 1: KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

                {/* Security Score — spans 2 cols on mobile */}
                <div className="col-span-2 md:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Security Score</p>
                    {securityScore !== null ? (
                        <div className="flex items-end gap-2">
                            <span className="text-5xl font-semibold leading-none" style={{ color: scoreStyle.color }}>{securityScore}</span>
                            <span className="text-lg text-gray-400 mb-0.5">/100</span>
                        </div>
                    ) : (
                        <span className="text-3xl font-medium text-gray-400">N/A</span>
                    )}
                    {scoreStyle && (
                        <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: scoreStyle.bg }}>
                            {scoreStyle.label}
                        </span>
                    )}
                    {securityScore !== null && (
                        <div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${securityScore}%`, backgroundColor: scoreStyle.bg }} />
                        </div>
                    )}
                </div>

                <KpiCard
                    icon={AlertTriangle}
                    title="Critical Issues"
                    value={totalCritical}
                    subtitle="Across all scans"
                    valueColor="#EF4444"
                    iconColor="#EF4444"
                    iconBg="bg-red-50 dark:bg-red-900/20"
                />
                <KpiCard
                    icon={Shield}
                    title="Policy Compliance"
                    value={policyPassRate !== null ? `${policyPassRate}%` : '—'}
                    subtitle={dashboardData.kyverno.available
                        ? `${dashboardData.kyverno.counts.PASS || 0} / ${dashboardData.kyverno.total} checks`
                        : 'No data'}
                    valueColor={policyColor}
                    iconColor="#10B981"
                    iconBg="bg-emerald-50 dark:bg-emerald-900/20"
                />
                <KpiCard
                    icon={Server}
                    title="CIS Benchmark"
                    value={cisPassRate !== null ? `${cisPassRate}%` : '—'}
                    subtitle={dashboardData.kubebench.available
                        ? `${dashboardData.kubebench.counts.PASS || 0} / ${dashboardData.kubebench.total} checks`
                        : 'No data'}
                    valueColor={cisColor}
                    iconColor="#3B82F6"
                    iconBg="bg-blue-50 dark:bg-blue-900/20"
                />
                <KpiCard
                    icon={Wifi}
                    title="Network Exposed"
                    value={dashboardData.nmap.available ? dashboardData.nmap.servicesWithWeakCiphers : '—'}
                    subtitle={dashboardData.nmap.available ? `of ${dashboardData.nmap.total} services` : 'No data'}
                    valueColor={dashboardData.nmap.available && dashboardData.nmap.servicesWithWeakCiphers > 0 ? '#F97316' : '#10B981'}
                    iconColor="#F97316"
                    iconBg="bg-orange-50 dark:bg-orange-900/20"
                />
            </div>

            {/* ── Row 2: Vulnerability Comparison (2/3) + Policy Donut (1/3) ───── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {vulnBreakdownData.length > 0 && (() => {
                    const SCAN_COLORS = {
                        Image:   '#F87171',
                        SBOM:    '#FB923C',
                        Repo:    '#C084FC',
                        Cluster: '#60A5FA',
                    };
                    const SEV_LABELS = ['Critical', 'High', 'Medium', 'Low'];
                    const SEV_KEYS   = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

                    const radarData = SEV_KEYS.map((sev, i) => {
                        const entry = { subject: SEV_LABELS[i] };
                        vulnBreakdownData.forEach(({ name, counts, total }) => {
                            entry[name] = total > 0 ? +((counts[sev] || 0) / total * 100).toFixed(1) : 0;
                        });
                        return entry;
                    });

                    return (
                        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Activity className="w-4 h-4 text-blue-500" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Vulnerability Profile</h3>
                                <span className="ml-auto text-xs text-gray-400">% of findings per severity</span>
                            </div>

                            <ResponsiveContainer width="100%" height={240}>
                                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                                    <PolarGrid stroke={theme.grid} />
                                    <PolarAngleAxis
                                        dataKey="subject"
                                        tick={{ fontSize: 12, fill: theme.axis, fontWeight: 600 }}
                                    />
                                    <PolarRadiusAxis
                                        angle={90}
                                        domain={[0, 100]}
                                        tick={{ fontSize: 10, fill: theme.axis }}
                                        tickFormatter={v => `${v}%`}
                                        axisLine={false}
                                    />
                                    {vulnBreakdownData.map(({ name }) => (
                                        <Radar
                                            key={name}
                                            name={name}
                                            dataKey={name}
                                            stroke={SCAN_COLORS[name]}
                                            fill={SCAN_COLORS[name]}
                                            fillOpacity={0.12}
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: SCAN_COLORS[name] }}
                                        />
                                    ))}
                                    <Tooltip
                                        {...tooltipProps}
                                        formatter={(value, name) => [`${value}%`, name]}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>

                            {/* Scan type legend + totals */}
                            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                {vulnBreakdownData.map(({ name, Icon, iconColor, total }) => (
                                    <div key={name} className="flex items-center gap-1.5 text-xs">
                                        <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: SCAN_COLORS[name] }} />
                                        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: iconColor }} />
                                        <span className="text-gray-600 dark:text-gray-400">{name}</span>
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">({total.toLocaleString()})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {policyPieData.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                            <Shield className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Policy Status</h3>
                            <span className="ml-auto text-xs text-gray-400">{dashboardData.kyverno.total} checks</span>
                        </div>
                        <DonutChart
                            data={policyPieData}
                            centerValue={policyPassRate !== null ? `${policyPassRate}%` : ''}
                            centerLabel="Pass Rate"
                            height={210}
                        />
                        <SeverityLegend data={policyPieData} />
                    </div>
                )}
            </div>

            {/* ── Row 3: Per-scan-type donuts ────────────────────────────────────── */}
            {(imagePieData.length > 0 || sbomPieData.length > 0 || repoPieData.length > 0 || clusterPieData.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {imagePieData.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <ImageIcon className="w-4 h-4 text-red-400" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Image Vulns</h3>
                                <span className="ml-auto text-xs font-bold text-gray-400">{dashboardData.trivyImage.total}</span>
                            </div>
                            <DonutChart
                                data={imagePieData}
                                centerValue={dashboardData.trivyImage.counts.CRITICAL || 0}
                                centerLabel="Critical"
                                height={170}
                            />
                            <SeverityLegend data={imagePieData} />
                        </div>
                    )}

                    {sbomPieData.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Package className="w-4 h-4 text-orange-400" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">SBOM Vulns</h3>
                                <span className="ml-auto text-xs font-bold text-gray-400">{dashboardData.trivySbom.total}</span>
                            </div>
                            <DonutChart
                                data={sbomPieData}
                                centerValue={dashboardData.trivySbom.counts.CRITICAL || 0}
                                centerLabel="Critical"
                                height={170}
                            />
                            <SeverityLegend data={sbomPieData} />
                        </div>
                    )}

                    {repoPieData.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <GitBranch className="w-4 h-4 text-purple-400" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Repo Vulns</h3>
                                <span className="ml-auto text-xs font-bold text-gray-400">{dashboardData.trivyRepo.total}</span>
                            </div>
                            <DonutChart
                                data={repoPieData}
                                centerValue={dashboardData.trivyRepo.counts.CRITICAL || 0}
                                centerLabel="Critical"
                                height={170}
                            />
                            <SeverityLegend data={repoPieData} />
                        </div>
                    )}

                    {clusterPieData.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Globe className="w-4 h-4 text-blue-400" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Cluster Misconfigs</h3>
                                <span className="ml-auto text-xs font-bold text-gray-400">{dashboardData.cluster.total}</span>
                            </div>
                            <DonutChart
                                data={clusterPieData}
                                centerValue={dashboardData.cluster.counts.CRITICAL || 0}
                                centerLabel="Critical"
                                height={170}
                            />
                            <SeverityLegend data={clusterPieData} />
                        </div>
                    )}
                </div>
            )}

            {/* ── Row 4: CIS Benchmark + Nmap ────────────────────────────────────── */}
            {(dashboardData.kubebench.available || dashboardData.nmap.available) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {dashboardData.kubebench.available && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-5">
                                <Server className="w-4 h-4 text-blue-500" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">CIS Benchmark Results</h3>
                                <span className="ml-auto text-xs text-gray-400">{dashboardData.kubebench.total} total checks</span>
                            </div>
                            <ComplianceBar label="Passed" count={dashboardData.kubebench.counts.PASS || 0} total={dashboardData.kubebench.total} color="#10B981" />
                            <ComplianceBar label="Warned" count={dashboardData.kubebench.counts.WARN || 0} total={dashboardData.kubebench.total} color="#F59E0B" />
                            <ComplianceBar label="Failed" count={dashboardData.kubebench.counts.FAIL || 0} total={dashboardData.kubebench.total} color="#EF4444" />
                            {(dashboardData.kubebench.counts.INFO || 0) > 0 && (
                                <ComplianceBar label="Info" count={dashboardData.kubebench.counts.INFO || 0} total={dashboardData.kubebench.total} color="#6B7280" />
                            )}
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs">
                                <span className="text-emerald-500 font-semibold">✓ {dashboardData.kubebench.counts.PASS || 0} Passed</span>
                                <span className="text-yellow-500 font-semibold">⚠ {dashboardData.kubebench.counts.WARN || 0} Warned</span>
                                <span className="text-red-500 font-semibold">✗ {dashboardData.kubebench.counts.FAIL || 0} Failed</span>
                            </div>
                        </div>
                    )}

                    {dashboardData.nmap.available && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-5">
                                <Wifi className="w-4 h-4 text-orange-500" />
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Network Security</h3>
                                <span className="ml-auto text-xs text-gray-400">{dashboardData.nmap.total} services scanned</span>
                            </div>
                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart
                                    data={[{
                                        name: 'Services',
                                        'Weak Ciphers': dashboardData.nmap.servicesWithWeakCiphers,
                                        'Secure': dashboardData.nmap.total - dashboardData.nmap.servicesWithWeakCiphers,
                                    }]}
                                    layout="vertical"
                                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
                                    <XAxis type="number" stroke={theme.axis} tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" stroke={theme.axis} tick={{ fontSize: 12 }} width={60} />
                                    <Tooltip {...tooltipProps} />
                                    <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                                    <Bar dataKey="Weak Ciphers" stackId="a" fill={COLORS.HIGH} />
                                    <Bar dataKey="Secure" stackId="a" fill={COLORS.PASS} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="mt-5 grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="text-center">
                                    <div className="text-3xl font-black text-orange-500">{dashboardData.nmap.servicesWithWeakCiphers}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Weak Cipher Services</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-black text-emerald-500">
                                        {dashboardData.nmap.total - dashboardData.nmap.servicesWithWeakCiphers}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Secure Services</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
