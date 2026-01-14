import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Shield, AlertTriangle, Package, Globe, Image as ImageIcon } from 'lucide-react';

const COLORS = {
    CRITICAL: '#DC2626',
    HIGH: '#EA580C',
    MEDIUM: '#F59E0B',
    LOW: '#3B82F6',
    UNKNOWN: '#6B7280',
    PASS: '#10B981',
    FAIL: '#DC2626',
    WARN: '#F59E0B',
    ERROR: '#DC2626',
    SKIP: '#6B7280'
};

export default function DashboardCharts() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dashboardData, setDashboardData] = useState({
        kyverno: { counts: {}, total: 0, available: false },
        trivyImage: { counts: {}, total: 0, available: false },
        trivySbom: { counts: {}, total: 0, available: false },
        trivyRepo: { counts: {}, total: 0, available: false },
        nmap: { total: 0, weakCiphers: 0, safeCiphers: 0, available: false },
        kubebench: { counts: {}, total: 0, available: false },
        cluster: { counts: {}, total: 0, available: false }
    });

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/dashboard/stats');
            if (!response.ok) {
                throw new Error('Failed to load dashboard data');
            }
            const data = await response.json();
            setDashboardData(data);
        } catch (err) {
            console.error('Error loading dashboard data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const SummaryCard = ({ icon: Icon, title, value, subtitle, color, bgColor, dualValues }) => (
        <div className={`p-6 rounded-xl border ${bgColor} border-gray-300 dark:border-gray-700 shadow-lg transition-all hover:shadow-xl`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</p>
                    {dualValues ? (
                        <div className="flex items-baseline gap-3">
                            <div>
                                <p className={`text-2xl font-bold ${dualValues.color1}`}>{dualValues.value1}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{dualValues.label1}</p>
                            </div>
                            <div className="text-gray-400 dark:text-gray-600 text-xl font-bold">|</div>
                            <div>
                                <p className={`text-2xl font-bold ${dualValues.color2}`}>{dualValues.value2}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{dualValues.label2}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className={`text-3xl font-bold ${color}`}>{value}</p>
                            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{subtitle}</p>}
                        </>
                    )}
                </div>
                <div className={`p-3 rounded-lg ${color.replace('text', 'bg').replace(/\d+/, '100')} dark:${color.replace('text', 'bg').replace(/\d+/, '500/20')}`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                </div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-azure-600"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading dashboard data...</p>
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
                        <h3 className="font-bold text-yellow-800 dark:text-yellow-300">Dashboard Data Unavailable</h3>
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">Run scans to generate reports and view visualizations here.</p>
                    </div>
                </div>
            </div>
        );
    }

    // Prepare data for charts
    const kyvernoPieData = Object.entries(dashboardData.kyverno.counts)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({ name, value }));

    const trivyImagePieData = Object.entries(dashboardData.trivyImage.counts)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({ name, value }));

    const trivySbomPieData = Object.entries(dashboardData.trivySbom.counts)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({ name, value }));

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                    icon={Shield}
                    title="Policy Compliance"
                    color="text-emerald-600 dark:text-emerald-400"
                    bgColor="bg-white dark:bg-gray-800"
                    dualValues={{
                        value1: dashboardData.kyverno.counts.FAIL || 0,
                        label1: 'Failures',
                        color1: 'text-red-600 dark:text-red-400',
                        value2: dashboardData.kyverno.counts.PASS || 0,
                        label2: 'Passes',
                        color2: 'text-emerald-600 dark:text-emerald-400'
                    }}
                />
                <SummaryCard
                    icon={ImageIcon}
                    title="Image Vulnerabilities"
                    color="text-red-600 dark:text-red-400"
                    bgColor="bg-white dark:bg-gray-800"
                    dualValues={{
                        value1: dashboardData.trivyImage.counts.CRITICAL || 0,
                        label1: 'Critical',
                        color1: 'text-red-600 dark:text-red-400',
                        value2: dashboardData.trivyImage.counts.HIGH || 0,
                        label2: 'High',
                        color2: 'text-orange-600 dark:text-orange-400'
                    }}
                />
                <SummaryCard
                    icon={Package}
                    title="SBOM Issues"
                    color="text-orange-600 dark:text-orange-400"
                    bgColor="bg-white dark:bg-gray-800"
                    dualValues={{
                        value1: dashboardData.trivySbom.counts.CRITICAL || 0,
                        label1: 'Critical',
                        color1: 'text-red-600 dark:text-red-400',
                        value2: dashboardData.trivySbom.counts.HIGH || 0,
                        label2: 'High',
                        color2: 'text-orange-600 dark:text-orange-400'
                    }}
                />
                <SummaryCard
                    icon={Globe}
                    title="Network Scans"
                    value={dashboardData.nmap.servicesWithWeakCiphers || 0}
                    subtitle="services with weak ciphers"
                    color="text-red-600 dark:text-red-400"
                    bgColor="bg-white dark:bg-gray-800"
                />
            </div>

            {/* Individual Bar Charts - 4 Charts in Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Policy Bar Chart */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Policy</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={[{
                            name: 'Status',
                            FAIL: dashboardData.kyverno.counts.FAIL || 0,
                            WARN: dashboardData.kyverno.counts.WARN || 0,
                            PASS: dashboardData.kyverno.counts.PASS || 0,
                        }]} margin={{ left: -30, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9CA3AF" hide />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#F3F4F6'
                                }}
                                labelStyle={{ color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                iconSize={10}
                                verticalAlign="bottom"
                            />
                            <Bar dataKey="FAIL" fill={COLORS.FAIL} />
                            <Bar dataKey="WARN" fill={COLORS.WARN} />
                            <Bar dataKey="PASS" fill={COLORS.PASS} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Image Vulnerability Bar Chart */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <ImageIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Image Vulnerability</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={[{
                            name: 'Severity',
                            CRITICAL: dashboardData.trivyImage.counts.CRITICAL || 0,
                            HIGH: dashboardData.trivyImage.counts.HIGH || 0,
                            MEDIUM: dashboardData.trivyImage.counts.MEDIUM || 0,
                            LOW: dashboardData.trivyImage.counts.LOW || 0,
                        }]} margin={{ left: -30, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9CA3AF" hide />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#F3F4F6'
                                }}
                                labelStyle={{ color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                iconSize={10}
                                verticalAlign="bottom"
                            />
                            <Bar dataKey="CRITICAL" fill={COLORS.CRITICAL} />
                            <Bar dataKey="HIGH" fill={COLORS.HIGH} />
                            <Bar dataKey="MEDIUM" fill={COLORS.MEDIUM} />
                            <Bar dataKey="LOW" fill={COLORS.LOW} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* SBOM Bar Chart */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">SBOM</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={[{
                            name: 'Severity',
                            CRITICAL: dashboardData.trivySbom.counts.CRITICAL || 0,
                            HIGH: dashboardData.trivySbom.counts.HIGH || 0,
                            MEDIUM: dashboardData.trivySbom.counts.MEDIUM || 0,
                            LOW: dashboardData.trivySbom.counts.LOW || 0,
                        }]} margin={{ left: -30, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9CA3AF" hide />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#F3F4F6'
                                }}
                                labelStyle={{ color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                iconSize={10}
                                verticalAlign="bottom"
                            />
                            <Bar dataKey="CRITICAL" fill={COLORS.CRITICAL} />
                            <Bar dataKey="HIGH" fill={COLORS.HIGH} />
                            <Bar dataKey="MEDIUM" fill={COLORS.MEDIUM} />
                            <Bar dataKey="LOW" fill={COLORS.LOW} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Nmap SSL Bar Chart */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Nmap SSL</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={[{
                            name: 'Services',
                            'With Weak Ciphers': dashboardData.nmap.servicesWithWeakCiphers || 0,
                            'Secure': (dashboardData.nmap.total || 0) - (dashboardData.nmap.servicesWithWeakCiphers || 0),
                        }]} margin={{ left: -30, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9CA3AF" hide />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#F3F4F6'
                                }}
                                labelStyle={{ color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                iconSize={10}
                                verticalAlign="bottom"
                            />
                            <Bar dataKey="With Weak Ciphers" fill={COLORS.CRITICAL} />
                            <Bar dataKey="Secure" fill={COLORS.PASS} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Pie Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Kyverno Pie Chart */}
                {kyvernoPieData.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Kyverno Policy Status
                        </h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <defs>
                                    {Object.entries(COLORS).map(([name, color]) => (
                                        <linearGradient key={`kyverno-${name}`} id={`kyverno-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                                            <stop offset="50%" stopColor={color} stopOpacity={0.85} />
                                            <stop offset="100%" stopColor={color} stopOpacity={0.65} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <Pie
                                    data={kyvernoPieData}
                                    cx="50%"
                                    cy="40%"
                                    startAngle={180}
                                    endAngle={-180}
                                    outerRadius={95}
                                    fill="#8884d8"
                                    dataKey="value"
                                    paddingAngle={4}
                                    labelLine={{
                                        stroke: '#9CA3AF',
                                        strokeWidth: 1.5
                                    }}
                                    label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = outerRadius + 28;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                            <text
                                                x={x}
                                                y={y}
                                                fill="#1F2937"
                                                textAnchor={x > cx ? 'start' : 'end'}
                                                dominantBaseline="central"
                                                className="dark:fill-gray-200"
                                                style={{ fontSize: '13px', fontWeight: '500', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                            >
                                                {`${name} ${(percent * 100).toFixed(0)}%`}
                                            </text>
                                        );
                                    }}
                                >
                                    {kyvernoPieData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={`url(#kyverno-${entry.name})`}
                                            stroke="none"
                                            style={{
                                                filter: 'drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.35)) drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.25))',
                                            }}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(31, 41, 55, 0.98)',
                                        border: '2px solid #374151',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                        color: '#F3F4F6',
                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                    }}
                                    labelStyle={{ color: '#F3F4F6', fontWeight: '600' }}
                                    itemStyle={{ color: '#F3F4F6', fontWeight: '400' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Trivy Image Pie Chart */}
                {trivyImagePieData.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            Image Vulnerabilities
                        </h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <defs>
                                    {Object.entries(COLORS).map(([name, color]) => (
                                        <linearGradient key={`image-${name}`} id={`image-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                                            <stop offset="50%" stopColor={color} stopOpacity={0.85} />
                                            <stop offset="100%" stopColor={color} stopOpacity={0.65} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <Pie
                                    data={trivyImagePieData}
                                    cx="50%"
                                    cy="40%"
                                    startAngle={180}
                                    endAngle={-180}
                                    outerRadius={95}
                                    fill="#8884d8"
                                    dataKey="value"
                                    paddingAngle={4}
                                    labelLine={{
                                        stroke: '#9CA3AF',
                                        strokeWidth: 1.5
                                    }}
                                    label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = outerRadius + 28;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                            <text
                                                x={x}
                                                y={y}
                                                fill="#1F2937"
                                                textAnchor={x > cx ? 'start' : 'end'}
                                                dominantBaseline="central"
                                                className="dark:fill-gray-200"
                                                style={{ fontSize: '13px', fontWeight: '500', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                            >
                                                {`${name} ${(percent * 100).toFixed(0)}%`}
                                            </text>
                                        );
                                    }}
                                >
                                    {trivyImagePieData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={`url(#image-${entry.name})`}
                                            stroke="none"
                                            style={{
                                                filter: 'drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.35)) drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.25))',
                                            }}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(31, 41, 55, 0.98)',
                                        border: '2px solid #374151',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                        color: '#F3F4F6',
                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                    }}
                                    labelStyle={{ color: '#F3F4F6', fontWeight: '600' }}
                                    itemStyle={{ color: '#F3F4F6', fontWeight: '400' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
                {/* SBOM Pie Chart */}
                {trivySbomPieData.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-300 dark:border-gray-700 shadow-lg">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            SBOM Vulnerabilities
                        </h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <defs>
                                    {Object.entries(COLORS).map(([name, color]) => (
                                        <linearGradient key={`sbom-${name}`} id={`sbom-${name}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                                            <stop offset="50%" stopColor={color} stopOpacity={0.85} />
                                            <stop offset="100%" stopColor={color} stopOpacity={0.65} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <Pie
                                    data={trivySbomPieData}
                                    cx="50%"
                                    cy="40%"
                                    startAngle={180}
                                    endAngle={-180}
                                    outerRadius={95}
                                    fill="#8884d8"
                                    dataKey="value"
                                    paddingAngle={4}
                                    labelLine={{
                                        stroke: '#9CA3AF',
                                        strokeWidth: 1.5
                                    }}
                                    label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = outerRadius + 28;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                            <text
                                                x={x}
                                                y={y}
                                                fill="#1F2937"
                                                textAnchor={x > cx ? 'start' : 'end'}
                                                dominantBaseline="central"
                                                className="dark:fill-gray-200"
                                                style={{ fontSize: '13px', fontWeight: '500', fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                            >
                                                {`${name} ${(percent * 100).toFixed(0)}%`}
                                            </text>
                                        );
                                    }}
                                >
                                    {trivySbomPieData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={`url(#sbom-${entry.name})`}
                                            stroke="none"
                                            style={{
                                                filter: 'drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.35)) drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.25))',
                                            }}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(31, 41, 55, 0.98)',
                                        border: '2px solid #374151',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                        color: '#F3F4F6',
                                        fontFamily: 'system-ui, -apple-system, sans-serif'
                                    }}
                                    labelStyle={{ color: '#F3F4F6', fontWeight: '600' }}
                                    itemStyle={{ color: '#F3F4F6', fontWeight: '400' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
