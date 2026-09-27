import PageHead from './PageHead';
import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Download } from 'lucide-react';
import FindingsView, { DEFAULT_FINDING_FILTERS } from './FindingsView';
import { REPORT_TABS, Badge, SEV_ORDER, SEV_COLOR, countBy, FigureStrip, ToggleGroup, SearchBox, FilterLabel, MultiSelect, Chip, useSort, sortRows, SortTh, usePaging, Pager, EmptyRow } from './reportParts';

// activeView is owned by App so the left panel's report sub-items and this page stay in sync.
export default function PolicyReports({ activeView }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data States
  const [kyvernoData, setKyvernoData] = useState({ rows: [], counts: {} });
  const [sbomData, setSbomData] = useState({ list: [], counts: {} });
  const [nmapData, setNmapData] = useState([]);
  const [cisData, setCisData] = useState({ list: [], counts: {} });
  const [clusterData, setClusterData] = useState({ list: [], counts: {} });

  // Image Report State
  const [imageFiles, setImageFiles] = useState([]);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imageData, setImageData] = useState({ list: [], counts: {} });

  // Git Repo Report State
  const [trivyRepoFiles, setTrivyRepoFiles] = useState([]);
  const [selectedTrivyRepoFile, setSelectedTrivyRepoFile] = useState(null);
  const [trivyRepoData, setTrivyRepoData] = useState({ list: [], counts: {} });

  // Image report namespace: '' shows aggregate totals, 'ALL' or a namespace lists its reports
  const [imageNs, setImageNs] = useState('ALL');

  // Suppressions
  const [suppressions, setSuppressions] = useState([]);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [suppressModal, setSuppressModal] = useState(null); // { cve_id, pkg, scan_type }
  const [suppressReason, setSuppressReason] = useState('accepted-risk');
  const [suppressNote, setSuppressNote] = useState('');

  // Fetch logic
  useEffect(() => {
    setError(null);
    if (activeView === 'kyverno') {
      loadKyverno();
    } else if (activeView === 'sbom') {
      loadSbom();
    } else if (activeView === 'nmap') {
      loadNmap();
    } else if (activeView === 'image') {
      fetchImageFiles();
    } else if (activeView === 'cis') {
      loadCis();
    } else if (activeView === 'cluster') {
      loadCluster();
    } else if (activeView === 'trivy-repo') {
      fetchTrivyRepoFiles();
    }
  }, [activeView]);

  // Load Image Data when file selected
  useEffect(() => {
    if (activeView === 'image' && selectedImageFile) {
      loadImageReport(selectedImageFile);
    }
  }, [selectedImageFile]);

  // Load suppressions on mount
  useEffect(() => {
    fetch('/api/suppressions/')
      .then(r => r.ok ? r.json() : [])
      .then(data => setSuppressions(Array.isArray(data) ? data : []))
      .catch(() => { });
  }, []);


  // Latest dashboard stats: tab counts and aggregate totals when no report file is selected
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => { });
  }, []);
  const dashboardCounts = {
    trivyImage: stats?.trivyImage || { counts: {}, total: 0 },
    trivyRepo: stats?.trivyRepo || { counts: {}, total: 0 },
  };

  // Load Git Repo Data when file selected
  useEffect(() => {
    if (activeView === 'trivy-repo' && selectedTrivyRepoFile) {
      loadTrivyRepoReport(selectedTrivyRepoFile);
    }
  }, [selectedTrivyRepoFile]);


  const loadKyverno = async () => {
    if (kyvernoData.rows.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/kyverno-report/kyverno.zip');
      if (res.status === 404) {
        // Graceful handling for missing report
        setKyvernoData({ rows: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Kyverno report: ${res.status}`);
      const blob = await res.blob();

      const zip = await JSZip.loadAsync(blob);
      let file = zip.file(/kyverno\.json$/i)[0];
      if (!file) {
        const jsonFiles = zip.filter((relPath) => /\.json$/i.test(relPath));
        file = jsonFiles[0];
      }
      if (!file) throw new Error('No JSON file found in Kyverno ZIP');

      const text = await file.async('string');
      const rows = parseKyverno(JSON.parse(text));

      const counts = { FAIL: 0, WARN: 0, ERROR: 0, SKIP: 0, PASS: 0 };
      rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

      setKyvernoData({ rows, counts });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSbom = async () => {
    if (sbomData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/trivy-sbom/sbom.json');
      if (res.status === 404) {
        setSbomData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load SBOM report: ${res.status}`);
      const json = await res.json();
      const parsed = parseSbom(json);
      setSbomData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadNmap = async () => {
    if (nmapData.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/nmap/nmap.json');
      if (res.status === 404) {
        setNmapData([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Nmap report: ${res.status}`);
      const json = await res.json();
      const rows = parseSSL(json); // Reuse SSL parser logic for Nmap report as per requirement
      setNmapData(rows);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCis = async () => {
    if (cisData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/kube-bench/kubebench.txt');
      if (res.status === 404) {
        setCisData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load CIS report: ${res.status}`);
      const text = await res.text();
      const parsed = parseCisText(text);
      setCisData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCluster = async () => {
    if (clusterData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/trivy-cluster-report/cluster.zip');
      if (res.status === 404) {
        setClusterData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Cluster report: ${res.status}`);
      const blob = await res.blob();
      const zip = await JSZip.loadAsync(blob);
      let file = zip.file(/cluster\.json$/i)[0];
      if (!file) {
        const jsonFiles = zip.filter((relPath) => /\.json$/i.test(relPath));
        file = jsonFiles[0];
      }
      if (!file) throw new Error('No JSON file found in Cluster ZIP');

      const text = await file.async('string');
      const parsed = parseCluster(JSON.parse(text));
      setClusterData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchImageFiles = async () => {
    if (imageFiles.length > 0) return;
    setLoading(true);
    try {
      // New backend endpoint to list files in trivy-reports
      const res = await fetch('/api/files/list?subpath=trivy-reports');
      if (!res.ok) throw new Error(`Failed to list image reports: ${res.status}`);
      const files = await res.json();
      setImageFiles(files);
      // Default namespace is "All namespaces": open its first report straight away.
      if (files.length > 0) setSelectedImageFile(f => f || files[0]);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadImageReport = async (filename) => {
    setLoading(true);
    try {
      const res = await fetch(`/new/trivy-reports/${filename}`);
      if (!res.ok) throw new Error(`Failed to load report ${filename}: ${res.status}`);
      const json = await res.json();
      const parsed = parseImage(json);
      setImageData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fetchTrivyRepoFiles = async () => {
    if (trivyRepoFiles.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/files/list?subpath=trivy_repo_scan');
      if (!res.ok) throw new Error(`Failed to list repo reports: ${res.status}`);
      const files = await res.json();
      setTrivyRepoFiles(files);
      if (files.length > 0) setSelectedTrivyRepoFile(files[0]);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadTrivyRepoReport = async (filename) => {
    setLoading(true);
    try {
      const res = await fetch(`/new/trivy_repo_scan/${filename}`);
      if (!res.ok) throw new Error(`Failed to load report ${filename}: ${res.status}`);
      const json = await res.json();
      const parsed = parseTrivyRepo(json);
      setTrivyRepoData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  // --- Parsers ---

  function getCvssScore(v) {
    if (!v.CVSS) return null;
    for (const source of Object.values(v.CVSS)) {
      if (source.V3Score != null) return parseFloat(source.V3Score);
    }
    for (const source of Object.values(v.CVSS)) {
      if (source.V2Score != null) return parseFloat(source.V2Score);
    }
    return null;
  }

  function parseKyverno(json) {
    const items = Array.isArray(json?.items) ? json.items : [json];
    const rows = [];
    items.forEach(item => {
      if (!item || !item.results) return;
      const metaNs = (item.metadata && item.metadata.namespace) || '';
      const scope = item.scope || {};
      const scopeNs = scope.namespace || metaNs;
      const scopeKind = scope.kind || '';
      const scopeName = scope.name || '';
      item.results.forEach(res => {
        const status = String(res.result || '').toUpperCase();
        const sev = String(res.severity || 'UNKNOWN').toUpperCase();
        const base = { status, severity: sev, policy: res.policy || '', message: res.message || '', type: scopeKind, name: scopeName, namespace: scopeNs };
        const rlist = Array.isArray(res.resources) ? res.resources : [];
        if (rlist.length > 0) {
          rlist.forEach(r => {
            rows.push({
              ...base,
              type: String(r.kind || scopeKind || ''),
              name: String(r.name || scopeName || ''),
              namespace: String(r.namespace || scopeNs || '')
            });
          });
        } else {
          rows.push(base);
        }
      });
    });
    return rows;
  }

  function parseSbom(json) {
    const rows = [];
    if (!json || !Array.isArray(json.Results)) return { list: rows, counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 } };
    for (const res of json.Results) {
      const vulns = res.Vulnerabilities || [];
      const pkgsById = new Map();
      const pkgs = res.Packages || [];
      for (const p of pkgs) { const id = p.ID || p.Identifier?.BOMRef || p.Identifier?.PURL || p.Name; pkgsById.set(id, p); }
      for (const v of vulns) {
        const pkgId = String(v.PkgID || v.PkgName || '');
        const pkgName = String(v.PkgName || pkgsById.get(pkgId)?.Name || pkgId);
        rows.push({
          id: String(v.VulnerabilityID || ''),
          library: pkgName,
          installed: String(v.InstalledVersion || pkgsById.get(pkgId)?.Version || ''),
          fixed: String(v.FixedVersion || ''),
          status: String(v.Status || ''),
          severity: String(v.Severity || '').toUpperCase(),
          title: String(v.Title || ''),
          ref: Array.isArray(v.References) && v.References.length ? v.References[0] : (v.PrimaryURL || ''),
          cvss: getCvssScore(v)
        });
      }
    }
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const r of rows) { const s = (r.severity || 'UNKNOWN').toUpperCase(); counts[s] = (counts[s] || 0) + 1; }
    return { list: rows, counts };
  }

  function parseSSL(data) {
    const rows = [];
    if (!data) return rows;
    const arr = Array.isArray(data) ? data : [];
    for (const item of arr) {
      rows.push({
        namespace: String(item.namespace || ''),
        fqdn: String(item.fqdn || ''),
        port: item.port != null ? item.port : '',
        accepted: Array.isArray(item.accepted_ciphers) ? item.accepted_ciphers : [],
        weak: Array.isArray(item.weak_ciphers) ? item.weak_ciphers : [],
        safe: Array.isArray(item.safe_ciphers) ? item.safe_ciphers : []
      });
    }
    return rows;
  }

  function parseImage(json) {
    if (!json) return { list: [], counts: {} };
    const results = json.Results || json.results || [];
    const list = [];
    results.forEach(r => {
      const vuls = r.Vulnerabilities || r.vulnerabilities || [];
      vuls.forEach(v => {
        list.push({
          severity: (v.Severity || v.severity || "UNKNOWN").toUpperCase(),
          id: v.VulnerabilityID || v.vulnerabilityID || v.CVE || "",
          pkg: v.PkgName || v.pkgName || "",
          installed: v.InstalledVersion || v.installedVersion || "",
          fixed: v.FixedVersion || v.fixedVersion || "",
          title: v.Title || v.title || "",
          target: r.Target || r.target || json.ArtifactName || json.artifactName || "",
          refs: v.References || v.references || [],
          cvss: getCvssScore(v)
        });
      });
    });
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }

  function parseTrivyRepo(json) {
    if (!json) return { list: [], counts: {} };
    const list = [];
    const results = json.Results || [];

    results.forEach(res => {
      const target = res.Target || '';

      // Handle Packages (Vulnerabilities)
      if (res.Vulnerabilities) {
        res.Vulnerabilities.forEach(v => {
          list.push({
            type: 'Vulnerability',
            severity: (v.Severity || 'UNKNOWN').toUpperCase(),
            id: v.VulnerabilityID || '',
            pkg: v.PkgName || '',
            installed: v.InstalledVersion || '',
            fixed: v.FixedVersion || '',
            title: v.Title || '',
            desc: v.Description || '',
            target: target,
            refs: v.References || [],
            cvss: getCvssScore(v)
          });
        });
      }

      // Handle Secrets
      if (res.Secrets) {
        res.Secrets.forEach(s => {
          list.push({
            type: 'Secret',
            severity: (s.Severity || 'UNKNOWN').toUpperCase(),
            id: s.RuleID || '',
            pkg: s.Category || '',
            installed: `Lines ${s.StartLine}-${s.EndLine}`,
            fixed: 'N/A',
            title: s.Title || '',
            desc: 'Code Match',
            target: target,
            refs: []
          });
        });
      }
    });

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }

  function parseCisText(text) {
    if (!text) return { list: [], counts: {} };
    const lines = String(text).split(/\r?\n/);

    // Build section map from INFO headers (e.g., "1.2 API Server")
    const sectionMap = {};
    for (const line of lines) {
      const sm = line.match(/^\[INFO\]\s+([0-9]+(?:\.[0-9]+)?)\s+(.*)$/);
      if (sm) { sectionMap[sm[1]] = sm[2].trim(); }
    }
    const findSectionName = (id) => {
      let bestPrefix = '';
      let name = '';
      for (const prefix in sectionMap) {
        if (id === prefix || id.startsWith(prefix + '.')) {
          if (prefix.length > bestPrefix.length) { bestPrefix = prefix; name = sectionMap[prefix]; }
        }
      }
      if (name) return name;
      const major = id.split('.')[0];
      const majorMap = { '1': 'Control Plane', '2': 'Etcd', '3': 'Control Plane Config', '4': 'Worker Node', '5': 'Policies' };
      return majorMap[major] || `Group ${major}`;
    };

    // Build remediation map from "== Remediations ... ==" blocks
    const remMap = {};
    let inRem = false; let currentId = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^==\s*Remediations/.test(line)) { inRem = true; currentId = null; continue; }
      if (inRem && (/^==\s*Summary/.test(line) || /^\[INFO\]/.test(line) || /^\[(FAIL|WARN|PASS|INFO)\]/.test(line))) { inRem = false; currentId = null; continue; }
      if (!inRem) continue;

      const idm = line.match(/^([0-9]+(?:\.[0-9]+)+)\b(.*)$/);
      if (idm) {
        currentId = idm[1];
        const first = idm[2].trim();
        remMap[currentId] = first ? first : '';
        continue;
      }
      if (currentId) {
        if (/^==/.test(line)) { inRem = false; currentId = null; continue; }
        const t = line.trim();
        remMap[currentId] += (remMap[currentId] ? '\n' : '') + t;
      }
    }

    // Parse checks and attach section + remediation
    const list = [];
    const counts = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 };

    for (const line of lines) {
      const m = line.match(/^\[(FAIL|WARN|PASS|INFO)\]\s+([0-9]+(?:\.[0-9]+)+)\s+(.*)$/);
      if (m) {
        const status = m[1];
        const id = m[2];
        let title = m[3].trim();
        const typeMatch = title.match(/\((Manual|Automated)\)\s*$/);
        if (typeMatch) { title = title.replace(/\s*\((Manual|Automated)\)\s*$/, ''); }
        const section = findSectionName(id);
        const remediation = remMap[id] || '';

        list.push({ status, id, desc: title, section, remediation });
        counts[status] = (counts[status] || 0) + 1;
      }
    }

    return { list, counts };
  }

  function parseCluster(json) {
    if (!json) return { list: [], counts: {} };
    let results = [];
    // Support top-level Results/results
    if (Array.isArray(json.Results)) {
      results = json.Results;
    } else if (Array.isArray(json.results)) {
      results = json.results;
    }
    // Support Trivy Cluster schema: Findings (with Namespace/Kind/Name)
    if (Array.isArray(json.Findings)) {
      json.Findings.forEach(f => {
        const rlist = f.Results || f.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: f.Namespace, Kind: f.Kind, Name: f.Name } });
        });
      });
    } else if (Array.isArray(json.findings)) {
      json.findings.forEach(f => {
        const rlist = f.Results || f.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: f.Namespace, Kind: f.Kind, Name: f.Name } });
        });
      });
    }
    // Support alternative Trivy Cluster schema: Resources (Kind/Name)
    if (Array.isArray(json.Resources)) {
      json.Resources.forEach(res => {
        const rlist = res.Results || res.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: res.Namespace, Kind: res.Kind, Name: res.Name } });
        });
      });
    } else if (Array.isArray(json.resources)) {
      json.resources.forEach(res => {
        const rlist = res.Results || res.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: res.Namespace, Kind: res.Kind, Name: res.Name } });
        });
      });
    }

    const list = [];
    results.forEach(r => {
      const mis = r.Misconfigurations || r.misconfigurations || [];
      const ctx = r._ctx || {};
      mis.forEach(m => {
        const composedTarget = r.Target || r.target || [ctx.Namespace, (ctx.Kind && ctx.Name) ? `${ctx.Kind}/${ctx.Name}` : (ctx.Kind || ctx.Name)].filter(Boolean).join(' ');
        list.push({
          severity: (m.Severity || m.severity || "UNKNOWN").toUpperCase(),
          id: m.ID || m.id || "",
          title: m.Title || m.title || "",
          msg: m.Message || m.message || m.Description || m.description || "",
          status: (m.Status || m.status || 'FAIL').toUpperCase(),
          target: composedTarget || "Kubernetes",
          type: 'Misconfig',
          link: m.PrimaryURL || m.primaryURL || (m.References && m.References[0]) || ""
        });
      });
      // Handle Vulnerabilities (if any in cluster scan)
      const vuls = r.Vulnerabilities || r.vulnerabilities || [];
      vuls.forEach(v => {
        list.push({
          severity: (v.Severity || v.severity || 'UNKNOWN').toUpperCase(),
          id: v.VulnerabilityID || v.vulnerabilityID || '',
          title: v.Title || v.title || '',
          msg: `Pkg: ${v.PkgName} ${v.InstalledVersion}`,
          status: 'FAIL',
          target: r.Target || r.target || '',
          type: 'Vuln',
          link: v.PrimaryURL || v.primaryURL || (v.References && v.References[0]) || ""
        });
      });
    });

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }


  // --- Suppressions ---
  const isSuppressed = React.useCallback((cve_id, pkg) =>
    suppressions.some(s => s.cve_id === cve_id && s.pkg === pkg), [suppressions]);

  // items: [{ cve_id, pkg, scan_type }]; onDone runs after the modal closes with a save.
  const openSuppress = (items, onDone) => { if (items.length) setSuppressModal({ items, onDone }); };

  const addSuppression = async () => {
    if (!suppressModal) return;
    const created = [];
    for (const it of suppressModal.items) {
      const body = { cve_id: it.cve_id, pkg: it.pkg, scan_type: it.scan_type, reason: suppressReason, note: suppressNote };
      try {
        const res = await fetch('/api/suppressions/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) created.push(await res.json());
      } catch { /* ignore */ }
    }
    setSuppressions(prev => [...prev, ...created]);
    suppressModal.onDone?.();
    closeSuppress();
  };

  const closeSuppress = () => { setSuppressModal(null); setSuppressNote(''); setSuppressReason('accepted-risk'); };

  const removeSuppression = async (cve_id, pkg) => {
    const sup = suppressions.find(s => s.cve_id === cve_id && s.pkg === pkg);
    if (!sup) return;
    try {
      await fetch(`/api/suppressions/${sup.id}`, { method: 'DELETE' });
      setSuppressions(prev => prev.filter(s => s.id !== sup.id));
    } catch { /* ignore */ }
  };

  const suppressProps = { isSuppressed, onSuppress: openSuppress, onUnsuppress: removeSuppression, showSuppressed, setShowSuppressed };

  // --- Filter state per tab ---
  const [filters, setFilters] = useState({
    kyverno: { ns: [], policy: [], kind: [], severity: '', status: { FAIL: true, WARN: true, ERROR: true, SKIP: true, PASS: true }, q: '' },
    cis: { status: { FAIL: true, WARN: true, INFO: true, PASS: true }, section: [], q: '' },
    cluster: { sev: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true }, q: '' },
    nmap: { ns: [], weakOnly: false, q: '' },
    image: DEFAULT_FINDING_FILTERS,
    sbom: DEFAULT_FINDING_FILTERS,
    'trivy-repo': DEFAULT_FINDING_FILTERS,
  });
  const setTab = (tab) => (patch) => setFilters(f => ({ ...f, [tab]: { ...f[tab], ...patch } }));

  const TABS = REPORT_TABS;
  const TAB_SUB = {
    image: 'Container image vulnerabilities from Trivy',
    sbom: 'Vulnerabilities in the software bill of materials',
    cluster: 'Kubernetes misconfigurations and vulnerable workloads',
    cis: 'CIS Kubernetes Benchmark results from kube-bench',
    kyverno: 'Kyverno policy report results across namespaces',
    nmap: 'TLS ciphers accepted by cluster services',
    'trivy-repo': 'Vulnerabilities and secrets in configured Git repositories',
  };

  // --- Suppress dialog ---
  const SuppressModal = () => {
    if (!suppressModal) return null;
    const items = suppressModal.items;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--scrim)' }} onClick={closeSuppress}>
        <div role="dialog" aria-modal="true" aria-labelledby="suppress-title" className="sheet w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="phead"><h2 id="suppress-title">{items.length > 1 ? `Suppress ${items.length} findings` : 'Suppress finding'}</h2></div>
          <div className="p-4 flex flex-col gap-3.5">
            <p className="num m-0 text-xs break-all" style={{ color: 'var(--mute)' }}>
              {items.length > 1 ? items.slice(0, 4).map(i => i.cve_id).join(', ') + (items.length > 4 ? ` +${items.length - 4} more` : '') : `${items[0].cve_id}${items[0].pkg ? ` · ${items[0].pkg}` : ''}`}
            </p>
            <div>
              <FilterLabel>Reason</FilterLabel>
              <div className="seg mt-1.5 w-full">
                {['accepted-risk', 'false-positive'].map(r => (
                  <button key={r} type="button" className={`flex-1 ${suppressReason === r ? 'on' : ''}`} aria-pressed={suppressReason === r} onClick={() => setSuppressReason(r)}>
                    {r === 'accepted-risk' ? 'Accepted risk' : 'False positive'}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">Note <span className="hint">Optional: justification or ticket reference.</span>
              <textarea className="inp resize-none" rows={3} value={suppressNote} onChange={e => setSuppressNote(e.target.value)} placeholder="Add justification or ticket reference…" />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--line)', background: 'var(--panel-head)' }}>
            <button type="button" className="btn" onClick={closeSuppress}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={addSuppression}>{items.length > 1 ? `Suppress ${items.length}` : 'Suppress finding'}</button>
          </div>
        </div>
      </div>
    );
  };

  // ============================ Policies (Kyverno) ============================
  const kf = filters.kyverno;
  const setKf = setTab('kyverno');
  const kyvernoOptions = React.useMemo(() => {
    const uniq = (k) => Array.from(new Set(kyvernoData.rows.map(r => r[k]).filter(v => v !== undefined))).sort();
    const nsFail = {};
    kyvernoData.rows.forEach(r => { if (r.status === 'FAIL' || r.status === 'ERROR') nsFail[r.namespace] = (nsFail[r.namespace] || 0) + 1; else nsFail[r.namespace] ||= 0; });
    return { ns: uniq('namespace'), policy: uniq('policy'), kind: uniq('type'), severity: uniq('severity'), nsFail };
  }, [kyvernoData.rows]);
  // Every filter except status; status counts are computed on this so toggles show what they would add.
  const kyvernoBase = React.useMemo(() => {
    const needle = kf.q.trim().toLowerCase();
    return kyvernoData.rows.filter(r =>
      (!kf.ns.length || kf.ns.includes(r.namespace)) &&
      (!kf.policy.length || kf.policy.includes(r.policy)) &&
      (!kf.kind.length || kf.kind.includes(r.type)) &&
      (!kf.severity || r.severity === kf.severity) &&
      (!needle || [r.name, r.message, r.policy].some(v => String(v || '').toLowerCase().includes(needle))));
  }, [kyvernoData.rows, kf]);
  const kyvernoRows = kyvernoBase.filter(r => kf.status[r.status] ?? true);
  const [kSort, onKSort] = useSort('policy');
  const kyvernoSorted = React.useMemo(() => sortRows(kyvernoRows, kSort, {
    status: v => ['FAIL', 'ERROR', 'WARN', 'SKIP', 'PASS'].indexOf(v),
    severity: v => SEV_ORDER.indexOf(v),
  }), [kyvernoRows, kSort]);
  const kPaging = usePaging(kyvernoSorted, JSON.stringify(kf));
  const kStatusCounts = countBy(kyvernoBase, 'status');
  const kAll = countBy(kyvernoData.rows, 'status');
  const statusOff = Object.entries(kf.status).filter(([, v]) => !v).map(([k]) => k);
  const resetK = () => setKf({ ns: [], policy: [], kind: [], severity: '', status: { FAIL: true, WARN: true, ERROR: true, SKIP: true, PASS: true }, q: '' });
  const kActive = kf.ns.length || kf.policy.length || kf.kind.length || kf.severity || statusOff.length || kf.q;

  const renderKyverno = () => (
    <div className="flex flex-col gap-3.5">
      <FigureStrip items={[
        { label: 'Fail', swatch: SEV_COLOR.FAIL, value: kAll.FAIL || 0, color: kAll.FAIL ? 'var(--crit)' : undefined },
        { label: 'Warn', swatch: SEV_COLOR.WARN, value: kAll.WARN || 0 },
        { label: 'Error', swatch: SEV_COLOR.ERROR, value: kAll.ERROR || 0 },
        { label: 'Skip', swatch: SEV_COLOR.SKIP, value: kAll.SKIP || 0 },
        { label: 'Pass', swatch: SEV_COLOR.PASS, value: kAll.PASS || 0, color: 'var(--ok)' },
        { label: 'Total', value: kyvernoData.rows.length, note: `${kyvernoOptions.policy.length} policies · ${kyvernoOptions.ns.length} namespaces` },
      ]} />

      <section className="sheet !overflow-visible">
        <div className="phead">
          <h2>Filters</h2>
          <span className="meta">Showing <span className="num">{kyvernoRows.length}</span> of <span className="num">{kyvernoData.rows.length}</span> results</span>
          <div className="flex-1" />
          {kActive ? <button type="button" className="lnk" onClick={resetK}>Reset filters</button> : null}
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-3.5 py-3">
          <div className="flex flex-col gap-1"><FilterLabel>Namespace</FilterLabel>
            <MultiSelect label="Namespace" options={kyvernoOptions.ns} selected={kf.ns} onChange={v => setKf({ ns: v })} counts={kyvernoOptions.nsFail} allLabel={`All namespaces (${kyvernoOptions.ns.length})`} width={210} /></div>
          <div className="flex flex-col gap-1"><FilterLabel>Policy</FilterLabel>
            <MultiSelect label="Policy" options={kyvernoOptions.policy} selected={kf.policy} onChange={v => setKf({ policy: v })} allLabel={`All policies (${kyvernoOptions.policy.length})`} width={210} /></div>
          <div className="flex flex-col gap-1"><FilterLabel>Resource kind</FilterLabel>
            <MultiSelect label="Resource kind" options={kyvernoOptions.kind} selected={kf.kind} onChange={v => setKf({ kind: v })} allLabel="All kinds" width={170} /></div>
          <label className="flex flex-col gap-1"><FilterLabel>Severity</FilterLabel>
            <select className="inp h-7 w-[120px] py-0" value={kf.severity} onChange={e => setKf({ severity: e.target.value })}>
              <option value="">Any</option>
              {kyvernoOptions.severity.map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1"><FilterLabel>Status</FilterLabel>
            <ToggleGroup label="Status" keys={['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS']} value={kf.status} onChange={v => setKf({ status: v })} counts={kStatusCounts} /></div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]"><FilterLabel>Search</FilterLabel>
            <SearchBox value={kf.q} onChange={v => setKf({ q: v })} placeholder="Resource, message or policy" width="100%" /></div>
        </div>
        {kActive ? (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2" style={{ borderTop: '1px solid var(--line-soft)', background: 'var(--panel-head)' }}>
            <FilterLabel>Active</FilterLabel>
            {kf.ns.length > 0 && <Chip label="Namespace" value={kf.ns.join(', ')} onRemove={() => setKf({ ns: [] })} />}
            {kf.policy.length > 0 && <Chip label="Policy" value={kf.policy.join(', ')} onRemove={() => setKf({ policy: [] })} />}
            {kf.kind.length > 0 && <Chip label="Kind" value={kf.kind.join(', ')} onRemove={() => setKf({ kind: [] })} />}
            {kf.severity && <Chip label="Severity" value={kf.severity} onRemove={() => setKf({ severity: '' })} />}
            {statusOff.length > 0 && <Chip label="Status" value={Object.keys(kf.status).filter(k => kf.status[k]).join(', ') || 'none'} onRemove={() => setKf({ status: { FAIL: true, WARN: true, ERROR: true, SKIP: true, PASS: true } })} />}
            {kf.q && <Chip label="Search" value={kf.q} onRemove={() => setKf({ q: '' })} />}
            <button type="button" className="lnk" onClick={resetK}>Clear all</button>
          </div>
        ) : null}
      </section>

      <section className="sheet">
        <div className="overflow-x-auto">
          <table className="ctable">
            <thead><tr>
              <SortTh label="Status" k="status" sort={kSort} onSort={onKSort} className="w-[92px]" />
              <SortTh label="Severity" k="severity" sort={kSort} onSort={onKSort} className="w-[100px]" />
              <SortTh label="Policy" k="policy" sort={kSort} onSort={onKSort} />
              <SortTh label="Kind" k="type" sort={kSort} onSort={onKSort} />
              <SortTh label="Resource" k="name" sort={kSort} onSort={onKSort} />
              <SortTh label="Namespace" k="namespace" sort={kSort} onSort={onKSort} />
              <th>Message</th>
            </tr></thead>
            <tbody>
              {kPaging.slice.map((r, i) => (
                <tr key={i}>
                  <td><Badge value={r.status} /></td>
                  <td><Badge value={r.severity} /></td>
                  <td className="num text-xs whitespace-nowrap" style={{ color: 'var(--accent-text)' }}>{r.policy}</td>
                  <td>{r.type}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="num text-xs">{r.namespace}</td>
                  <td className="max-w-[420px] truncate" title={r.message}>{r.message}</td>
                </tr>
              ))}
              {kyvernoRows.length === 0 && <EmptyRow cols={7}>{kyvernoData.rows.length ? 'No results match these filters.' : 'No policy report yet. Run the Policy compliance scan.'}</EmptyRow>}
            </tbody>
          </table>
        </div>
        <Pager p={kPaging} />
      </section>
    </div>
  );

  // ============================ CIS benchmark ============================
  const cf = filters.cis;
  const setCf = setTab('cis');
  const cisSections = React.useMemo(() => Array.from(new Set(cisData.list.map(r => r.section))).sort(), [cisData.list]);
  const cisBase = cisData.list.filter(r => (!cf.section.length || cf.section.includes(r.section)) &&
    (!cf.q || [r.id, r.desc, r.remediation].some(v => String(v || '').toLowerCase().includes(cf.q.toLowerCase()))));
  const cisRows = cisBase.filter(r => cf.status[r.status] ?? true);
  const [cSort, onCSort] = useSort('id');
  const cisSorted = React.useMemo(() => sortRows(cisRows, cSort, { status: v => ['FAIL', 'WARN', 'INFO', 'PASS'].indexOf(v) }), [cisRows, cSort]);
  const cPaging = usePaging(cisSorted, JSON.stringify(cf));

  const renderCis = () => (
    <div className="flex flex-col gap-3.5">
      <FigureStrip items={[
        { label: 'Fail', swatch: SEV_COLOR.FAIL, value: cisData.counts.FAIL || 0, color: cisData.counts.FAIL ? 'var(--crit)' : undefined },
        { label: 'Warn', swatch: SEV_COLOR.WARN, value: cisData.counts.WARN || 0 },
        { label: 'Info', swatch: SEV_COLOR.INFO, value: cisData.counts.INFO || 0 },
        { label: 'Pass', swatch: SEV_COLOR.PASS, value: cisData.counts.PASS || 0, color: 'var(--ok)' },
        { label: 'Total', value: cisData.list.length, note: `${cisSections.length} sections` },
      ]} />
      <section className="sheet !overflow-visible">
        <div className="phead"><h2>Checks <span className="count">{cisRows.length}</span></h2><span className="meta">of {cisData.list.length}</span></div>
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
          <ToggleGroup label="Status" keys={['FAIL', 'WARN', 'INFO', 'PASS']} value={cf.status} onChange={v => setCf({ status: v })} counts={countBy(cisBase, 'status')} />
          <MultiSelect label="Section" options={cisSections} selected={cf.section} onChange={v => setCf({ section: v })} allLabel="All sections" width={220} />
          <SearchBox value={cf.q} onChange={v => setCf({ q: v })} placeholder="Check ID, title or remediation" />
        </div>
        <div className="overflow-x-auto">
          <table className="ctable">
            <thead><tr>
              <SortTh label="Status" k="status" sort={cSort} onSort={onCSort} className="w-[92px]" />
              <SortTh label="Check" k="id" sort={cSort} onSort={onCSort} className="w-[90px]" />
              <SortTh label="Section" k="section" sort={cSort} onSort={onCSort} />
              <th>Title</th>
              <th className="w-[38%]">Remediation</th>
            </tr></thead>
            <tbody>
              {cPaging.slice.map((r, i) => (
                <tr key={i}>
                  <td><Badge value={r.status} /></td>
                  <td className="num text-xs" style={{ color: 'var(--accent-text)' }}>{r.id}</td>
                  <td className="font-medium">{r.section || '—'}</td>
                  <td>{r.desc}</td>
                  <td className="num text-[11.5px] whitespace-pre-wrap" style={{ color: 'var(--mute)' }}>{r.remediation || '—'}</td>
                </tr>
              ))}
              {cisRows.length === 0 && <EmptyRow cols={5}>{cisData.list.length ? 'No checks match these filters.' : 'No CIS report yet. Run the CIS benchmark scan.'}</EmptyRow>}
            </tbody>
          </table>
        </div>
        <Pager p={cPaging} />
      </section>
    </div>
  );

  // ============================ Cluster risks ============================
  const clf = filters.cluster;
  const setClf = setTab('cluster');
  const clusterBase = clusterData.list.filter(r => !clf.q || [r.id, r.title, r.msg, r.target].some(v => String(v || '').toLowerCase().includes(clf.q.toLowerCase())));
  const clusterRows = clusterBase.filter(r => clf.sev[r.severity] ?? true);
  const [clSort, onClSort] = useSort('severity');
  const clusterSorted = React.useMemo(() => sortRows(clusterRows, clSort, { severity: v => SEV_ORDER.indexOf(v) }), [clusterRows, clSort]);
  const clPaging = usePaging(clusterSorted, JSON.stringify(clf));

  const renderCluster = () => (
    <div className="flex flex-col gap-3.5">
      <FigureStrip items={[
        ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => ({ label: s[0] + s.slice(1).toLowerCase(), swatch: SEV_COLOR[s], value: clusterData.counts[s] || 0, color: s === 'CRITICAL' && clusterData.counts[s] ? 'var(--crit)' : undefined })),
        { label: 'Total', value: clusterData.list.length, note: `${clusterData.list.filter(r => r.type === 'Misconfig').length} misconfigurations` },
      ]} />
      <section className="sheet">
        <div className="phead"><h2>Cluster findings <span className="count">{clusterRows.length}</span></h2><span className="meta">of {clusterData.list.length}</span></div>
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
          <SearchBox value={clf.q} onChange={v => setClf({ q: v })} placeholder="ID, title, message or resource" />
          <ToggleGroup label="Severity" keys={SEV_ORDER} value={clf.sev} onChange={v => setClf({ sev: v })} counts={countBy(clusterBase, 'severity')} />
        </div>
        <div className="overflow-x-auto">
          <table className="ctable">
            <thead><tr>
              <SortTh label="Severity" k="severity" sort={clSort} onSort={onClSort} className="w-[100px]" />
              <SortTh label="ID" k="id" sort={clSort} onSort={onClSort} />
              <SortTh label="Type" k="type" sort={clSort} onSort={onClSort} />
              <th>Title</th>
              <th>Message</th>
              <SortTh label="Resource" k="target" sort={clSort} onSort={onClSort} />
              <th className="w-[60px]">Ref</th>
            </tr></thead>
            <tbody>
              {clPaging.slice.map((r, i) => (
                <tr key={i}>
                  <td><Badge value={r.severity} /></td>
                  <td className="num text-xs" style={{ color: 'var(--accent-text)' }}>{r.id}</td>
                  <td>{r.type}</td>
                  <td className="font-medium">{r.title}</td>
                  <td className="max-w-[320px] truncate" title={r.msg} style={{ color: 'var(--mute)' }}>{r.msg}</td>
                  <td className="num text-xs break-all">{r.target}</td>
                  <td>{r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: 'var(--accent-text)' }}>Link</a> : <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                </tr>
              ))}
              {clusterRows.length === 0 && <EmptyRow cols={7}>{clusterData.list.length ? 'No findings match these filters.' : 'No cluster report yet. Run the Cluster risks scan.'}</EmptyRow>}
            </tbody>
          </table>
        </div>
        <Pager p={clPaging} />
      </section>
    </div>
  );

  // ============================ Network ============================
  const nf = filters.nmap;
  const setNf = setTab('nmap');
  const nmapAll = nmapData.filter(r => r.accepted && r.accepted.length > 0);
  const nmapNs = React.useMemo(() => Array.from(new Set(nmapAll.map(r => r.namespace))).sort(), [nmapData]);
  const nmapRows = nmapAll.filter(r => (!nf.ns.length || nf.ns.includes(r.namespace)) && (!nf.weakOnly || r.weak.length > 0) &&
    (!nf.q || [r.fqdn, r.namespace, String(r.port)].some(v => v.toLowerCase().includes(nf.q.toLowerCase()))));
  const [nSort, onNSort] = useSort('namespace');
  const nmapSorted = React.useMemo(() => sortRows(nmapRows.map(r => ({ ...r, weakCount: r.weak.length })), nSort), [nmapRows, nSort]);
  const nPaging = usePaging(nmapSorted, JSON.stringify(nf));
  const weakServices = nmapAll.filter(r => r.weak.length > 0).length;

  const renderNmap = () => (
    <div className="flex flex-col gap-3.5">
      <FigureStrip items={[
        { label: 'Services', value: nmapAll.length, note: `${nmapNs.length} namespaces` },
        { label: 'With weak ciphers', swatch: SEV_COLOR.WARN, value: weakServices, color: weakServices ? 'var(--warn)' : undefined },
        { label: 'Secure', swatch: SEV_COLOR.PASS, value: nmapAll.length - weakServices, color: 'var(--ok)' },
      ]} />
      <section className="sheet !overflow-visible">
        <div className="phead"><h2>Services <span className="count">{nmapRows.length}</span></h2><span className="meta">of {nmapAll.length}</span></div>
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
          <SearchBox value={nf.q} onChange={v => setNf({ q: v })} placeholder="Host, namespace or port" />
          <MultiSelect label="Namespace" options={nmapNs} selected={nf.ns} onChange={v => setNf({ ns: v })} allLabel="All namespaces" />
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={nf.weakOnly} onChange={e => setNf({ weakOnly: e.target.checked })} /> Weak ciphers only
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="ctable">
            <thead><tr>
              <SortTh label="Namespace" k="namespace" sort={nSort} onSort={onNSort} />
              <SortTh label="Host" k="fqdn" sort={nSort} onSort={onNSort} />
              <SortTh label="Port" k="port" sort={nSort} onSort={onNSort} className="w-[80px]" />
              <th>Accepted ciphers</th>
              <SortTh label="Weak ciphers" k="weakCount" sort={nSort} onSort={onNSort} />
            </tr></thead>
            <tbody>
              {nPaging.slice.map((r, i) => (
                <tr key={i}>
                  <td className="num text-xs">{r.namespace}</td>
                  <td style={{ color: 'var(--accent-text)' }}>{r.fqdn}</td>
                  <td className="num text-xs">{r.port}</td>
                  <td className="max-w-[420px]"><div className="flex flex-wrap gap-1">{r.accepted.map(c => <span key={c} className="badge badge-ok num !font-normal !whitespace-normal break-all">{c}</span>)}</div></td>
                  <td className="max-w-[320px]">{r.weak.length ? <div className="flex flex-wrap gap-1">{r.weak.map(c => <span key={c} className="badge badge-crit num !font-normal !whitespace-normal break-all">{c}</span>)}</div> : <span style={{ color: 'var(--faint)' }}>None</span>}</td>
                </tr>
              ))}
              {nmapRows.length === 0 && <EmptyRow cols={5}>{nmapAll.length ? 'No services match these filters.' : 'No network scan data yet. Run the Network exposure scan.'}</EmptyRow>}
            </tbody>
          </table>
        </div>
        <Pager p={nPaging} />
      </section>
    </div>
  );

  // ============================ Findings tabs (Images / SBOM / Repositories) ============================
  const aggFigures = (c) => [
    ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => ({ label: s[0] + s.slice(1).toLowerCase(), swatch: SEV_COLOR[s], value: c.counts?.[s] || 0, color: s === 'CRITICAL' && c.counts?.[s] ? 'var(--crit)' : undefined })),
    { label: 'Total', value: c.total || 0, note: 'All reports · pick one to see findings' },
  ];
  const imageScoped = imageFiles.filter(f => imageNs === 'ALL' || (imageNs && f.startsWith(imageNs + '/')));

  const renderImage = () => (
    <FindingsView
      {...suppressProps}
      rows={imageData.list}
      scanType="image"
      title="Image findings"
      filters={filters.image}
      onFilters={v => setFilters(f => ({ ...f, image: v }))}
      figuresOverride={imageNs === '' ? aggFigures(dashboardCounts.trivyImage) : undefined}
      emptyText={imageNs === '' ? 'Pick a namespace to load its image reports.' : 'No findings match these filters.'}
      controls={(
        <>
          <select className="inp h-7 w-[170px] py-0" aria-label="Namespace" value={imageNs} onChange={(e) => {
            const val = e.target.value;
            setImageNs(val);
            if (!val) { setSelectedImageFile(null); return; }
            const relevant = imageFiles.filter(f => val === 'ALL' || f.startsWith(val + '/'));
            setSelectedImageFile(relevant.length > 0 ? relevant[0] : null);
          }}>
            <option value="">Namespace: none</option>
            <option value="ALL">All namespaces</option>
            {Array.from(new Set(imageFiles.map(f => f.split('/')[0]))).sort().map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
          <select className="inp h-7 w-[220px] py-0" aria-label="Image report" value={selectedImageFile || ''} onChange={(e) => setSelectedImageFile(e.target.value)} disabled={!imageScoped.length}>
            {imageScoped.map(f => <option key={f} value={f}>{f.replace(/^[^/]+\//, '').replace('.json', '')}</option>)}
            {imageScoped.length === 0 && <option value="">No reports</option>}
          </select>
        </>
      )}
    />
  );

  const renderSbom = () => (
    <FindingsView
      {...suppressProps}
      rows={sbomData.list.map(r => ({ ...r, pkg: r.library, refs: r.ref ? [r.ref] : [], target: r.status || '' }))}
      scanType="sbom"
      title="SBOM findings"
      filters={filters.sbom}
      onFilters={v => setFilters(f => ({ ...f, sbom: v }))}
      emptyText={sbomData.list.length ? 'No findings match these filters.' : 'No SBOM report yet. Run the SBOM inventory scan.'}
    />
  );

  const renderRepo = () => (
    <FindingsView
      {...suppressProps}
      rows={trivyRepoData.list}
      scanType="trivy-repo"
      title="Repository findings"
      showType
      filters={filters['trivy-repo']}
      onFilters={v => setFilters(f => ({ ...f, 'trivy-repo': v }))}
      figuresOverride={!selectedTrivyRepoFile ? aggFigures(dashboardCounts.trivyRepo) : undefined}
      emptyText={trivyRepoFiles.length ? 'No findings match these filters.' : 'No repository reports yet. Configure Git repositories in Settings, then run the Source code scan.'}
      controls={(
        <select className="inp h-7 w-[220px] py-0" aria-label="Repository report" value={selectedTrivyRepoFile || ''} onChange={(e) => setSelectedTrivyRepoFile(e.target.value)} disabled={!trivyRepoFiles.length}>
          {trivyRepoFiles.length === 0 && <option value="">No reports</option>}
          {trivyRepoFiles.map(f => <option key={f} value={f}>{f.replace('.json', '')}</option>)}
        </select>
      )}
    />
  );

  // Report file offered in the page header, same place on every report screen.
  const EXPORTS = {
    kyverno: () => ({ href: '/new/kyverno-report/Policy_report.xlsx', file: 'Policy_report.xlsx', label: 'Export .xlsx' }),
    image: () => ({ href: '/new/trivy-reports/consolidated-report_images.xlsx', file: 'consolidated-report_images.xlsx', label: 'Export .xlsx' }),
    sbom: () => ({ href: '/new/trivy-sbom/sbom.json', file: 'sbom.json', label: 'Download .json' }),
    cluster: () => ({ href: '/new/trivy-cluster-report/cluster.zip', file: 'cluster.zip', label: 'Download .zip' }),
    cis: () => ({ href: '/new/kube-bench/kubebench.txt', file: 'kubebench.txt', label: 'Download .txt' }),
    nmap: () => ({ href: '/new/nmap/nmap.json', file: 'nmap.json', label: 'Download .json' }),
    'trivy-repo': () => (selectedTrivyRepoFile ? { href: `/new/trivy_repo_scan/${selectedTrivyRepoFile}`, file: selectedTrivyRepoFile.split('/').pop(), label: 'Download .json' } : null),
  };

  const VIEWS = { kyverno: renderKyverno, cis: renderCis, cluster: renderCluster, nmap: renderNmap, image: renderImage, sbom: renderSbom, 'trivy-repo': renderRepo };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-7 pt-[18px]">
        <PageHead title={TABS.find(t => t.id === activeView)?.label || 'Scan reports'} sub={TAB_SUB[activeView]}>
          {(() => {
            const e = EXPORTS[activeView]?.();
            return e && stats?.[TABS.find(t => t.id === activeView)?.key]?.available !== false ? (
              <a className="btn no-underline" href={e.href} download={e.file}><Download className="w-3 h-3" /> {e.label}</a>
            ) : null;
          })()}
        </PageHead>
      </div>

      <SuppressModal />

      {suppressions.length > 0 && (
        <div className="note note-warn mx-7 mt-3.5 items-center">
          <span className="font-semibold">{suppressions.length} finding{suppressions.length !== 1 ? 's' : ''} suppressed</span>
          <button type="button" className="lnk" style={{ color: 'inherit', textDecoration: 'underline' }} onClick={() => setShowSuppressed(v => !v)}>
            {showSuppressed ? 'Hide suppressed' : 'Show suppressed'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-7 pt-3.5 pb-6">
        {loading && <div className="sheet px-4 py-10 text-center text-xs" style={{ color: 'var(--mute)' }}>Loading report…</div>}
        {error && (
          <div className="note note-crit">
            <div>
              <div className="font-semibold">Error loading report</div>
              <div>{error}</div>
            </div>
          </div>
        )}
        {!loading && !error && VIEWS[activeView]?.()}
      </div>
    </div>
  );
}
