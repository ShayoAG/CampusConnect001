import { ARCHITECTURE_DATA, NODE_DIMENSIONS } from './architecture.data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

class ArchitectureDashboard {
  constructor(data) {
    this.data = data;
    this.nodesById = new Map((data.nodes || []).map((node) => [node.id, node]));
    this.actorsById = new Map((data.actors || []).map((actor) => [actor.id, actor]));
    this.serviceBadgesById = new Map((data.serviceBadges || []).map((badge) => [badge.id, badge]));
    this.edgesById = new Map((data.edges || []).map((edge) => [edge.id, edge]));
    this.embeddedById = new Map((data.embeddedNodes || []).map((item) => [item.id, item]));
    this.scenariosById = new Map((data.scenarios || []).map((scenario) => [scenario.id, scenario]));
    this.viewModesById = new Map((data.viewModes || []).map((mode) => [mode.id, mode]));
    this.ringsById = new Map((data.rings || []).map((ring) => [ring.id, ring]));
    this.groupsById = new Map((data.groups || []).map((group) => [group.id, group]));
    this.apSummaryById = new Map((data.apMappingSummary || []).map((entry) => [entry.ap, entry]));
    this.nodeGroupById = this.createNodeGroupMap(data.groups || []);
    this.serviceNodeIds = new Set(data.serviceNodeIds || []);

    const defaultViewMode = this.getEnabledViewModes()[0]?.id || 'architecture-layers';
    const defaultScenario = this.resolveDefaultScenarioId(defaultViewMode);

    this.state = {
      viewMode: defaultViewMode,
      scenario: defaultScenario,
      filter: 'all',
      showOptional: true,
      inspectorCollapsed: false,
      hasViewportOverride: false,
      activeTab: 'info',
      selectedType: null,
      selectedId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDragging: false,
      lastPointer: { x: 0, y: 0 },
    };

    this.elements = {
      appMain: document.getElementById('app-main'),
      viewModeNav: document.getElementById('view-mode-nav'),
      scenarioSelect: document.getElementById('scenario-select'),
      scenarioSelectLabel: document.getElementById('scenario-select-label'),
      filterButtons: Array.from(document.querySelectorAll('[data-filter]')),
      panelToggle: document.getElementById('panel-toggle'),
      optionalToggle: document.getElementById('optional-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      resetView: document.getElementById('reset-view'),
      scenarioKicker: document.getElementById('scenario-kicker'),
      scenarioHeadline: document.getElementById('scenario-headline'),
      scenarioDescription: document.getElementById('scenario-description'),
      scenarioProofRelevance: document.getElementById('scenario-proof-relevance'),
      scenarioProofLocal: document.getElementById('scenario-proof-local'),
      scenarioProofOptional: document.getElementById('scenario-proof-optional'),
      svgWrap: document.getElementById('svg-wrap'),
      svg: document.getElementById('architecture-svg'),
      defs: document.getElementById('svg-defs'),
      viewport: document.getElementById('viewport'),
      ringsLayer: document.getElementById('rings-layer'),
      groupsLayer: document.getElementById('groups-layer'),
      edgesLayer: document.getElementById('edges-layer'),
      nodesLayer: document.getElementById('nodes-layer'),
      tooltip: document.getElementById('tooltip'),
      tabs: Array.from(document.querySelectorAll('[data-tab]')),
      inspector: document.getElementById('inspector'),
      inspectorTitle: document.getElementById('inspector-title'),
      inspectorSubtitle: document.getElementById('inspector-subtitle'),
      inspectorContent: document.getElementById('inspector-content'),
    };

    this.currentModel = null;
    this.fitFrame = null;
    this.resizeObserver = null;

    this.init();
  }

  createNodeGroupMap(groups) {
    const map = new Map();
    groups.forEach((group) => {
      (group.nodeIds || []).forEach((nodeId) => {
        map.set(nodeId, group);
      });
    });
    return map;
  }

  getEnabledItems(items) {
    return (items || []).filter((item) => item?.enabled !== false);
  }

  getEnabledViewModes() {
    return this.getEnabledItems(this.data.viewModes);
  }

  resolveDefaultScenarioId(viewModeId) {
    const mode = this.viewModesById.get(viewModeId);
    if (
      mode?.enabled !== false &&
      mode?.defaultScenarioId &&
      this.scenariosById.get(mode.defaultScenarioId)?.enabled !== false
    ) {
      return mode.defaultScenarioId;
    }

    const firstScenario = this.getScenariosForViewMode(viewModeId)[0];
    if (firstScenario) return firstScenario.id;

    return this.getEnabledItems(this.data.scenarios)[0]?.id || 'layer-full-picture';
  }

  init() {
    this.populateViewModeButtons();
    this.populateScenarioSelect();
    this.injectMarkers();
    this.bindControls();
    this.bindDiagramInteractions();
    this.bindInspectorInteractions();
    this.bindLayoutObservers();
    this.syncControls();
    this.render();
    this.scheduleFitToContent();
  }

  populateViewModeButtons() {
    if (!this.elements.viewModeNav) return;

    const fragment = document.createDocumentFragment();
    this.getEnabledViewModes().forEach((mode) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'segment-btn view-mode-btn';
      button.dataset.viewMode = mode.id;
      button.textContent = mode.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      fragment.appendChild(button);
    });

    this.elements.viewModeNav.innerHTML = '';
    this.elements.viewModeNav.appendChild(fragment);
    this.elements.viewModeButtons = Array.from(this.elements.viewModeNav.querySelectorAll('[data-view-mode]'));
    this.elements.viewModeNav.style.setProperty('--view-mode-count', String(this.elements.viewModeButtons.length || 1));
  }

  getScenariosForViewMode(viewModeId = this.state.viewMode) {
    const mode = this.viewModesById.get(viewModeId);
    const ids = mode?.scenarioIds || [];
    if (ids.length) {
      return ids
        .map((id) => this.scenariosById.get(id))
        .filter((scenario) => Boolean(scenario) && scenario.enabled !== false);
    }

    return this.getEnabledItems(this.data.scenarios).filter((scenario) => scenario.viewModeId === viewModeId);
  }

  populateScenarioSelect() {
    const scenarios = this.getScenariosForViewMode();
    const fragment = document.createDocumentFragment();

    scenarios.forEach((scenario) => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.label;
      fragment.appendChild(option);
    });

    this.elements.scenarioSelect.innerHTML = '';
    this.elements.scenarioSelect.appendChild(fragment);

    if (!scenarios.some((scenario) => scenario.id === this.state.scenario)) {
      this.state.scenario = scenarios[0]?.id || this.state.scenario;
    }

    const viewMode = this.getCurrentViewMode();
    if (this.elements.scenarioSelectLabel) {
      this.elements.scenarioSelectLabel.textContent = viewMode?.secondaryLabel || 'Fokus';
    }
  }

  injectMarkers() {
    this.elements.defs.innerHTML = '';
    this.elements.defs.appendChild(this.createMarker('arrow-pii', 'var(--ai-brand-magenta)'));
    this.elements.defs.appendChild(this.createMarker('arrow-non-pii', 'var(--ai-brand-green)'));
  }

  createMarker(id, color) {
    const marker = this.createSvgElement('marker', {
      id,
      markerWidth: 12,
      markerHeight: 12,
      refX: 10,
      refY: 6,
      orient: 'auto',
      markerUnits: 'strokeWidth',
      viewBox: '0 0 12 12',
    });
    const path = this.createSvgElement('path', {
      d: 'M 0 1 L 0 11 L 10 6 z',
      fill: color,
    });
    marker.appendChild(path);
    return marker;
  }

  bindControls() {
    (this.elements.viewModeButtons || []).forEach((button) => {
      button.addEventListener('click', () => {
        this.state.viewMode = button.dataset.viewMode;
        this.state.scenario = this.resolveDefaultScenarioId(this.state.viewMode);
        this.state.selectedType = null;
        this.state.selectedId = null;
        this.populateScenarioSelect();
        this.render();
        this.scheduleFitToContent();
      });
    });

    this.elements.scenarioSelect.addEventListener('change', (event) => {
      this.state.scenario = event.target.value;
      this.state.selectedType = null;
      this.state.selectedId = null;
      this.render();
      this.scheduleFitToContent();
    });

    this.elements.filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.state.filter = button.dataset.filter;
        this.render();
      });
    });

    this.elements.panelToggle.addEventListener('click', () => {
      this.state.inspectorCollapsed = !this.state.inspectorCollapsed;
      this.render();
      this.scheduleFitToContent();
    });

    this.elements.optionalToggle.addEventListener('click', () => {
      this.state.showOptional = !this.state.showOptional;
      this.render();
    });

    this.elements.themeToggle.addEventListener('click', () => {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'light';
      root.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
      this.syncControls();
      this.render();
    });

    this.elements.resetView.addEventListener('click', () => {
      this.state.selectedType = null;
      this.state.selectedId = null;
      this.state.activeTab = 'info';
      this.render();
      this.scheduleFitToContent();
    });

    this.elements.tabs.forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const nextTab = tabButton.dataset.tab;
        this.state.activeTab = nextTab;

        if (nextTab !== 'flows' && this.state.selectedType === 'edge') {
          this.state.selectedType = null;
          this.state.selectedId = null;
        }

        this.render();
      });
    });
  }

  bindDiagramInteractions() {
    this.elements.svg.addEventListener('wheel', (event) => {
      event.preventDefault();

      const prevZoom = this.state.zoom;
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      const nextZoom = this.clamp(prevZoom * factor, 0.45, 2.8);
      if (nextZoom === prevZoom) return;

      const point = this.clientToSvgPoint(event.clientX, event.clientY);
      const ratio = nextZoom / prevZoom;

      this.state.pan.x = point.x - (point.x - this.state.pan.x) * ratio;
      this.state.pan.y = point.y - (point.y - this.state.pan.y) * ratio;
      this.state.zoom = nextZoom;
      this.state.hasViewportOverride = true;
      this.applyTransform();
    });

    this.elements.svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('[data-interactive="true"]')) return;

      this.state.isDragging = true;
      this.state.lastPointer = { x: event.clientX, y: event.clientY };
      this.elements.svgWrap.classList.add('is-dragging');
      this.hideTooltip();
    });

    this.elements.svg.addEventListener('click', (event) => {
      if (event.target.closest('[data-interactive="true"]')) return;
      if (this.state.selectedType || this.state.selectedId) {
        this.state.selectedType = null;
        this.state.selectedId = null;
        this.render();
      }
    });

    window.addEventListener('pointermove', (event) => {
      if (!this.state.isDragging) return;

      const rect = this.elements.svg.getBoundingClientRect();
      const scaleX = this.data.canvas.width / rect.width;
      const scaleY = this.data.canvas.height / rect.height;
      const dx = (event.clientX - this.state.lastPointer.x) * scaleX;
      const dy = (event.clientY - this.state.lastPointer.y) * scaleY;

      this.state.pan.x += dx;
      this.state.pan.y += dy;
      this.state.lastPointer = { x: event.clientX, y: event.clientY };
      this.state.hasViewportOverride = true;
      this.applyTransform();
    });

    window.addEventListener('pointerup', () => {
      this.state.isDragging = false;
      this.elements.svgWrap.classList.remove('is-dragging');
    });
  }

  bindLayoutObservers() {
    window.addEventListener('resize', () => {
      if (!this.state.hasViewportOverride) {
        this.scheduleFitToContent();
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.state.isDragging && !this.state.hasViewportOverride) {
          this.scheduleFitToContent();
        }
      });

      if (this.elements.svgWrap) {
        this.resizeObserver.observe(this.elements.svgWrap);
      }
    }
  }

  bindInspectorInteractions() {
    this.elements.inspectorContent.addEventListener('click', (event) => {
      const groupButton = event.target.closest('[data-select-group]');
      if (groupButton) {
        this.selectGroup(groupButton.dataset.selectGroup);
        return;
      }

      const edgeButton = event.target.closest('[data-select-edge]');
      if (edgeButton) {
        this.selectEdge(edgeButton.dataset.selectEdge);
        return;
      }

      const embeddedButton = event.target.closest('[data-select-embedded]');
      if (embeddedButton) {
        this.selectEmbedded(embeddedButton.dataset.selectEmbedded);
        return;
      }

      const nodeButton = event.target.closest('[data-select-node]');
      if (nodeButton) {
        this.selectNode(nodeButton.dataset.selectNode);
      }
    });
  }

  getCurrentViewMode() {
    const selectedMode = this.viewModesById.get(this.state.viewMode);
    if (selectedMode?.enabled !== false) return selectedMode;
    return this.getEnabledViewModes()[0] || null;
  }

  getCurrentScenario() {
    const selectedScenario = this.scenariosById.get(this.state.scenario);
    if (selectedScenario?.enabled !== false) return this.resolveScenario(selectedScenario);

    const fallbackScenario = this.getScenariosForViewMode()[0] || this.getEnabledItems(this.data.scenarios)[0];
    return this.resolveScenario(fallbackScenario);
  }

  resolveScenario(scenario) {
    if (!scenario) return null;
    if (!scenario.apFocusId) return scenario;
    return this.resolveApScenario(scenario);
  }

  resolveApScenario(scenario) {
    const focusApId = scenario.apFocusId;
    const relevantNodeIds = new Set([...(scenario.visibleNodeIds || []), ...(scenario.nodeIds || [])]);
    const relevantActorIds = new Set(scenario.visibleActorIds || []);
    const relevantBadgeIds = new Set(scenario.visibleServiceBadgeIds || []);
    const relevantEdgeIds = new Set([...(scenario.visibleEdgeIds || []), ...(scenario.edgeIds || [])]);
    const relevantGroupIds = new Set(scenario.visibleGroupIds || []);
    const relevantZoneIds = new Set(scenario.visibleZoneIds || []);

    const addEntityId = (entityId) => {
      if (this.nodesById.has(entityId)) {
        relevantNodeIds.add(entityId);
        return;
      }
      if (this.actorsById.has(entityId)) {
        relevantActorIds.add(entityId);
        return;
      }
      if (this.serviceBadgesById.has(entityId)) {
        relevantBadgeIds.add(entityId);
      }
    };

    const addEntityZone = (entityId) => {
      const entity = this.getEntityById(entityId);
      if (entity?.zone) relevantZoneIds.add(entity.zone);
    };

    const addEdge = (edge) => {
      if (!edge) return;
      relevantEdgeIds.add(edge.id);
      addEntityId(edge.source);
      addEntityId(edge.target);
    };

    const addEntity = (entity) => {
      if (!entity) return;
      addEntityId(entity.id);
      if (entity.parentNodeId) relevantNodeIds.add(entity.parentNodeId);
    };

    this.getEnabledItems(this.data.nodes)
      .filter((node) => this.collectDirectApIds(node).has(focusApId))
      .forEach(addEntity);

    this.getEnabledItems(this.data.actors)
      .filter((actor) => this.collectDirectApIds(actor).has(focusApId))
      .forEach(addEntity);

    this.getEnabledItems(this.data.serviceBadges)
      .filter((badge) => this.collectDirectApIds(badge).has(focusApId))
      .forEach(addEntity);

    this.getEnabledItems(this.data.embeddedNodes || [])
      .filter((item) => this.collectDirectApIds(item).has(focusApId))
      .forEach((item) => relevantNodeIds.add(item.parentNodeId));

    this.getEnabledItems(this.data.edges)
      .filter((edge) => this.collectDirectApIds(edge).has(focusApId))
      .forEach(addEdge);

    [...relevantNodeIds, ...relevantActorIds, ...relevantBadgeIds].forEach(addEntityZone);

    this.getEnabledItems(this.data.groups).forEach((group) => {
      if ((group.nodeIds || []).some((nodeId) => relevantNodeIds.has(nodeId))) {
        relevantGroupIds.add(group.id);
        relevantZoneIds.add(group.zone);
      }
    });

    return {
      ...scenario,
      strictNodeScope: true,
      disableDimming: true,
      visibleNodeIds: Array.from(relevantNodeIds),
      visibleActorIds: Array.from(relevantActorIds),
      visibleServiceBadgeIds: Array.from(relevantBadgeIds),
      visibleEdgeIds: Array.from(relevantEdgeIds),
      visibleGroupIds: Array.from(relevantGroupIds),
      visibleZoneIds: Array.from(relevantZoneIds),
      edgeIds: Array.from(relevantEdgeIds),
      nodeIds: Array.from(new Set([...relevantNodeIds, ...relevantActorIds, ...relevantBadgeIds])),
    };
  }

  getCurrentScenarioSummary() {
    const scenario = this.getCurrentScenario();
    return (
      scenario?.inspectorSummary ||
      this.data.inspectorSummary?.[scenario?.id] || {
        whatHappens: scenario?.description || 'Ausgewaehlte Perspektive der Architektur.',
        whyRelevant: 'Erklaert den funktionalen und sicherheitsrelevanten Fokus fuer Stakeholder.',
        localData: 'PII verbleibt lokal im DE/On-Prem Kern.',
        optionalServices: 'Optionale externe Services sind deutlich getrennt markiert.',
      }
    );
  }

  shouldShowDiagramFlows() {
    if (this.state.viewMode === 'architecture-layers') {
      return false;
    }

    return (
      this.state.viewMode === 'usage-scenarios' ||
      this.state.activeTab === 'flows' ||
      this.state.viewMode === 'security-flows' ||
      this.state.viewMode === 'rwth-aps'
    );
  }

  shouldForceEdgeLabels() {
    return this.state.viewMode === 'security-flows';
  }

  syncControls() {
    (this.elements.viewModeButtons || []).forEach((button) => {
      const isActive = button.dataset.viewMode === this.state.viewMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    this.elements.scenarioSelect.value = this.state.scenario;

    this.elements.filterButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.filter === this.state.filter);
    });

    const panelLabel = this.state.inspectorCollapsed
      ? 'Informationsleiste einblenden'
      : 'Informationsleiste ausblenden';
    this.elements.panelToggle.setAttribute('aria-pressed', String(this.state.inspectorCollapsed));
    this.elements.panelToggle.setAttribute('aria-label', panelLabel);
    this.elements.panelToggle.title = panelLabel;

    const optionalLabel = this.state.showOptional
      ? 'Optionale Services ausblenden'
      : 'Optionale Services einblenden';
    this.elements.optionalToggle.setAttribute('aria-pressed', String(this.state.showOptional));
    this.elements.optionalToggle.setAttribute('aria-label', optionalLabel);
    this.elements.optionalToggle.title = optionalLabel;

    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDarkTheme = theme === 'dark';
    const themeLabel = isDarkTheme ? 'Light-Theme aktivieren' : 'Dark-Theme aktivieren';
    this.elements.themeToggle.setAttribute('aria-pressed', String(isDarkTheme));
    this.elements.themeToggle.setAttribute('aria-label', themeLabel);
    this.elements.themeToggle.title = themeLabel;
    this.elements.themeToggle.dataset.theme = theme;

    this.elements.resetView.setAttribute('aria-label', 'Ansicht zentrieren');
    this.elements.resetView.title = 'Ansicht zentrieren';

    this.elements.appMain.classList.toggle('is-inspector-collapsed', this.state.inspectorCollapsed);
    this.elements.inspector.classList.toggle('is-collapsed', this.state.inspectorCollapsed);
    this.elements.inspector.setAttribute('aria-hidden', String(this.state.inspectorCollapsed));

    const currentScenario = this.getCurrentScenario();
    const currentViewMode = this.getCurrentViewMode();
    const summary = this.getCurrentScenarioSummary();

    if (this.elements.scenarioKicker) {
      this.elements.scenarioKicker.textContent = currentViewMode?.label || 'Praesentationsansicht';
    }

    if (this.elements.scenarioHeadline) {
      this.elements.scenarioHeadline.textContent =
        currentScenario?.label || 'Zielbild fuer Integration, Datenschutz und KI-Mehrwert';
    }

    if (this.elements.scenarioDescription) {
      this.elements.scenarioDescription.textContent =
        currentScenario?.description || currentViewMode?.description || 'Ausgewaehlte Perspektive der Architektur.';
    }

    if (this.elements.scenarioProofRelevance) {
      this.elements.scenarioProofRelevance.textContent =
        summary.whyRelevant || summary.whatHappens || 'Die Sicht erklaert den Auftrag auf einen Blick.';
    }

    if (this.elements.scenarioProofLocal) {
      this.elements.scenarioProofLocal.textContent =
        summary.localData || 'PII verbleibt im lokalen DE/On-Prem Kern.';
    }

    if (this.elements.scenarioProofOptional) {
      this.elements.scenarioProofOptional.textContent =
        summary.optionalServices || 'Optionale Services bleiben technisch und vertraglich klar getrennt.';
    }

    this.elements.tabs.forEach((tabButton) => {
      const isActive = tabButton.dataset.tab === this.state.activeTab;
      tabButton.classList.toggle('is-active', isActive);
      tabButton.setAttribute('aria-selected', String(isActive));
    });

    this.elements.svgWrap.classList.toggle('flows-visible', this.shouldShowDiagramFlows());
    this.elements.svgWrap.classList.toggle('security-view', this.shouldForceEdgeLabels());
  }

  applyTransform() {
    this.elements.viewport.setAttribute(
      'transform',
      `translate(${this.state.pan.x} ${this.state.pan.y}) scale(${this.state.zoom})`
    );
  }

  scheduleFitToContent() {
    if (this.fitFrame) {
      window.cancelAnimationFrame(this.fitFrame);
    }

    this.fitFrame = window.requestAnimationFrame(() => {
      this.fitFrame = window.requestAnimationFrame(() => {
        this.fitFrame = null;
        this.fitToContent();
      });
    });
  }

  fitToContent() {
    const model = this.buildRenderModel();
    const bounds = this.getContentBounds(model);
    const canvas = this.data.canvas;
    const margin = 24;
    const fitWidth = Math.max(220, canvas.width - margin * 2);
    const fitHeight = Math.max(220, canvas.height - margin * 2);
    const scaleX = fitWidth / bounds.width;
    const scaleY = fitHeight / bounds.height;
    const nextZoom = this.clamp(Math.min(scaleX, scaleY), 0.45, 2.2);

    const contentCenterX = bounds.minX + bounds.width / 2;
    const contentCenterY = bounds.minY + bounds.height / 2;

    this.state.zoom = nextZoom;
    this.state.pan.x = canvas.width / 2 - contentCenterX * nextZoom;
    this.state.pan.y = canvas.height / 2 - contentCenterY * nextZoom;
    this.state.hasViewportOverride = false;
    this.applyTransform();
  }

  getContentBounds(model) {
    const { centerX, centerY } = this.data.canvas;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const extend = (x1, y1, x2, y2) => {
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    };

    const ringFitFactor = 0.86;
    const rings = model.rings?.length ? model.rings : this.getEnabledItems(this.data.rings);
    rings.forEach((ring) => {
      extend(
        centerX - ring.rx * ringFitFactor,
        centerY - ring.ry * ringFitFactor,
        centerX + ring.rx * ringFitFactor,
        centerY + ring.ry * ringFitFactor
      );
    });

    const groups = model.groups?.length ? model.groups : this.getEnabledItems(this.data.groups);
    groups.forEach((group) => {
      extend(group.x, group.y, group.x + group.width, group.y + group.height);
    });

    model.nodes.forEach((node) => {
      extend(node.bounds.x, node.bounds.y, node.bounds.x + node.bounds.width, node.bounds.y + node.bounds.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return { minX: 0, minY: 0, width: this.data.canvas.width, height: this.data.canvas.height };
    }

    const padding = 42;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      width: Math.max(220, maxX - minX),
      height: Math.max(220, maxY - minY),
    };
  }

  render() {
    const model = this.buildRenderModel();
    this.currentModel = model;

    this.validateSelection(model);

    this.clearLayer(this.elements.ringsLayer);
    this.clearLayer(this.elements.groupsLayer);
    this.clearLayer(this.elements.edgesLayer);
    this.clearLayer(this.elements.nodesLayer);

    this.renderRings(model);
    this.renderGroups(model);
    if (model.showFlows) {
      this.renderEdges(model);
    }
    this.renderNodes(model);
    this.syncControls();
    this.renderInspector();
  }

  buildRenderModel() {
    const scenario = this.getCurrentScenario();
    const scopedZoneIds = scenario?.visibleZoneIds?.length ? new Set(scenario.visibleZoneIds) : null;
    const scopedGroupIds = scenario?.visibleGroupIds?.length ? new Set(scenario.visibleGroupIds) : null;
    const scopedEdgeIds = scenario?.visibleEdgeIds?.length ? new Set(scenario.visibleEdgeIds) : null;
    const hiddenNodeIds = scenario?.hiddenNodeIds?.length ? new Set(scenario.hiddenNodeIds) : null;
    const forceVisibleActorIds = scenario?.forceVisibleActorIds?.length
      ? new Set(scenario.forceVisibleActorIds)
      : null;
    const hiddenEmbeddedIds = scenario?.hiddenEmbeddedIds?.length
      ? new Set(scenario.hiddenEmbeddedIds)
      : null;
    const scopedNodeIds = scenario?.visibleNodeIds?.length
      ? new Set(scenario.visibleNodeIds)
      : scenario?.strictNodeScope && scenario?.nodeIds?.length
        ? new Set(scenario.nodeIds)
        : null;
    const scopedActorIds = Array.isArray(scenario?.visibleActorIds) ? new Set(scenario.visibleActorIds) : null;
    const scopedServiceBadgeIds = Array.isArray(scenario?.visibleServiceBadgeIds)
      ? new Set(scenario.visibleServiceBadgeIds)
      : null;

    const ringOverrides = scenario?.ringOverrides || {};
    const groupOverrides = scenario?.groupOverrides || {};
    const nodeOverrides = scenario?.nodeOverrides || {};

    const ringModels = this.getEnabledItems(this.data.rings)
      .filter((ring) => !scopedZoneIds || scopedZoneIds.has(ring.id))
      .map((ring) => {
        const emphasis = this.getZoneEmphasis(ring.id, scenario);
        return {
          ...ring,
          ...ringOverrides[ring.id],
          emphasis,
        };
      });

    const groupModels = this.getEnabledItems(this.data.groups)
      .filter(
        (group) =>
          (!scopedZoneIds || scopedZoneIds.has(group.zone)) &&
          (!scopedGroupIds || scopedGroupIds.has(group.id))
      )
      .map((group) => ({ ...group, ...(groupOverrides[group.id] || {}) }));

    const groupByNode = this.createNodeGroupMap(groupModels);
    const ringById = new Map(ringModels.map((ring) => [ring.id, ring]));

    let baseNodes = this.getEnabledItems(this.data.nodes).map((node) => ({ ...node }));
    const actorNodes = this.getEnabledItems(this.data.actors)
      .filter((actor) => this.state.showOptional || !actor.optional || forceVisibleActorIds?.has(actor.id))
      .filter((actor) => !scopedActorIds || scopedActorIds.has(actor.id))
      .map((actor) => ({
        ...actor,
        entityKind: 'actor',
        allowOutsideZone: true,
        isFloating: true,
      }));

    const serviceBadgeNodes = this.getEnabledItems(this.data.serviceBadges)
      .filter((badge) => this.state.showOptional || !badge.optional)
      .filter((badge) => !scopedServiceBadgeIds || scopedServiceBadgeIds.has(badge.id))
      .map((badge) => ({
        ...badge,
        entityKind: 'service-badge',
        allowOutsideZone: true,
        isFloating: true,
      }));

    let visibleNodes = [...baseNodes, ...actorNodes, ...serviceBadgeNodes]
      .filter((node) => this.state.showOptional || !node.optional);

    if (hiddenNodeIds) {
      visibleNodes = visibleNodes.filter((node) => !hiddenNodeIds.has(node.id));
    }

    if (scopedZoneIds) {
      visibleNodes = visibleNodes.filter((node) => scopedZoneIds.has(node.zone));
    }

    if (scopedNodeIds && scenario?.strictNodeScope) {
      visibleNodes = visibleNodes.filter((node) => {
        if (node.visualType === 'actor' || node.visualType === 'service-badge') return true;
        return scopedNodeIds.has(node.id);
      });
    }

    const highlightedEdgeIds = new Set(scenario?.edgeIds || []);
    const scenarioRelevantNodeIds = new Set(scenario?.nodeIds || []);
    const scenarioDimmingEnabled = scenario?.id !== 'overview-main' && !scenario?.disableDimming;
    const shouldDimByScenario =
      scenarioDimmingEnabled &&
      (highlightedEdgeIds.size > 0 || scenarioRelevantNodeIds.size > 0);

    const nodeModels = visibleNodes.map((node) => {
      const nodeData = { ...node, ...(nodeOverrides[node.id] || {}) };
      const narrativeWeight = this.getNarrativeWeight(nodeData);
      const byNarrative = !(scenario?.id === 'overview-main' && narrativeWeight < 0.52);

      return {
        ...nodeData,
        visualType: this.getNodeVisualType(nodeData),
        bounds: this.getNodeBounds(nodeData),
        zoneViolation: false,
        isDimmed: !byNarrative,
        narrativeWeight,
      };
    });

    const resolvedNodes = this.resolveNodeOverlaps(nodeModels, groupByNode, ringById);
    const resolvedNodeMap = new Map(resolvedNodes.map((node) => [node.id, node]));
    const resolvedNodeIdSet = new Set(resolvedNodes.map((node) => node.id));

    const embeddedModels = (this.data.embeddedNodes || [])
      .filter((item) => {
        if (item.scenarios?.length && !item.scenarios.includes(scenario?.id)) return false;
        if (hiddenEmbeddedIds?.has(item.id)) return false;
        if (!resolvedNodeIdSet.has(item.parentNodeId)) return false;
        if (scopedZoneIds && !scopedZoneIds.has(item.zone)) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        bounds: this.getEmbeddedBounds(item, resolvedNodeMap.get(item.parentNodeId)),
      }));

    const visibleNodeIds = new Set(resolvedNodes.map((node) => node.id));
    const visibleGroupIds = new Set(groupModels.map((group) => group.id));
    const visibleEmbeddedIds = new Set(embeddedModels.map((item) => item.id));

    let baseEdges = this.getEnabledItems(this.data.edges).filter(
      (edge) =>
        (this.state.showOptional || !edge.optional) &&
        (visibleNodeIds.has(edge.source) || visibleGroupIds.has(edge.source) || visibleEmbeddedIds.has(edge.source)) &&
        (visibleNodeIds.has(edge.target) || visibleGroupIds.has(edge.target) || visibleEmbeddedIds.has(edge.target))
    );

    if (scopedEdgeIds) {
      baseEdges = baseEdges.filter((edge) => scopedEdgeIds.has(edge.id));
    }

    const filteredEdges = baseEdges.filter(
      (edge) => this.state.filter === 'all' || edge.dataClass === this.state.filter
    );

    if (shouldDimByScenario) {
      filteredEdges.forEach((edge) => {
        if (highlightedEdgeIds.size === 0 || highlightedEdgeIds.has(edge.id)) {
          scenarioRelevantNodeIds.add(edge.source);
          scenarioRelevantNodeIds.add(edge.target);
        }
      });
    }

    const selectionFocus = this.buildSelectionFocus(filteredEdges, resolvedNodes);
    const filteredRelevantNodes = new Set();
    filteredEdges.forEach((edge) => {
      filteredRelevantNodes.add(edge.source);
      filteredRelevantNodes.add(edge.target);
    });

    const visibleNodeModels = resolvedNodes.map((node) => {
      const byFilter = this.isNodeRelevantForFilter(node, filteredRelevantNodes);
      const byScenario = !shouldDimByScenario || scenarioRelevantNodeIds.has(node.id);
      const bySelection =
        !selectionFocus.active ||
        selectionFocus.nodeIds.has(node.id) ||
        (this.state.selectedType === 'node' && this.state.selectedId === node.id);

      return {
        ...node,
        isDimmed: node.isDimmed || !byFilter || !byScenario || !bySelection,
      };
    });

    const edgeModels = filteredEdges.map((edge) => {
      const selectionDimmed =
        selectionFocus.active && !selectionFocus.edgeIds.has(edge.id) && this.state.selectedType !== 'edge';

      return {
        ...edge,
        isDimmed:
          (shouldDimByScenario && highlightedEdgeIds.size > 0 && !highlightedEdgeIds.has(edge.id)) ||
          selectionDimmed,
        isHighlighted: !shouldDimByScenario || highlightedEdgeIds.size === 0 || highlightedEdgeIds.has(edge.id),
        isOptional: Boolean(edge.optional),
      };
    });

    const embeddedByParent = new Map();
    embeddedModels.forEach((item) => {
      const list = embeddedByParent.get(item.parentNodeId) || [];
      list.push(item);
      embeddedByParent.set(item.parentNodeId, list);
    });

    const zoneViolations = visibleNodeModels.filter(
      (node) => node.zoneViolation && !node.allowOutsideZone && node.entityKind !== 'actor' && node.entityKind !== 'service-badge'
    );

    return {
      scenario,
      showFlows: this.shouldShowDiagramFlows(),
      forceEdgeLabels: this.shouldForceEdgeLabels(),
      rings: ringModels,
      groups: groupModels,
      nodes: visibleNodeModels,
      edges: edgeModels,
      embeddedNodes: embeddedModels,
      embeddedByParent,
      zoneViolations,
      groupIdSet: new Set(groupModels.map((group) => group.id)),
      nodeIdSet: new Set(visibleNodeModels.map((node) => node.id)),
      edgeIdSet: new Set(edgeModels.map((edge) => edge.id)),
      embeddedIdSet: new Set(embeddedModels.map((item) => item.id)),
    };
  }

  buildSelectionFocus(edges, visibleNodes) {
    const focus = {
      active: false,
      nodeIds: new Set(),
      edgeIds: new Set(),
    };

    if (!this.state.selectedType || !this.state.selectedId) return focus;

    if (this.state.selectedType === 'edge') {
      const edge = this.edgesById.get(this.state.selectedId);
      if (!edge) return focus;
      focus.active = true;
      focus.edgeIds.add(edge.id);
      this.addFocusEntity(edge.source, focus);
      this.addFocusEntity(edge.target, focus);
      return focus;
    }

    if (this.state.selectedType === 'group') {
      const group = this.getRenderedGroup(this.state.selectedId);
      if (!group) return focus;

      const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
      const memberIds = new Set((group.nodeIds || []).filter((nodeId) => visibleNodeIds.has(nodeId)));
      if (!memberIds.size) return focus;

      focus.active = true;
      memberIds.forEach((nodeId) => focus.nodeIds.add(nodeId));

      edges.forEach((edge) => {
        if (memberIds.has(edge.source) || memberIds.has(edge.target) || edge.source === group.id || edge.target === group.id) {
          focus.edgeIds.add(edge.id);
          this.addFocusEntity(edge.source, focus);
          this.addFocusEntity(edge.target, focus);
        }
      });

      return focus;
    }

    if (this.state.selectedType !== 'node' && this.state.selectedType !== 'embedded') return focus;

    const selected = this.getEntityById(this.state.selectedId);
    if (!selected) return focus;

    focus.active = true;
    this.addFocusEntity(selected.id, focus);

    if (selected.visualType === 'actor') {
      (selected.touchNodeIds || []).forEach((nodeId) => this.addFocusEntity(nodeId, focus));
      (selected.flowEdgeIds || []).forEach((edgeId) => focus.edgeIds.add(edgeId));
      edges.forEach((edge) => {
        if (focus.edgeIds.has(edge.id)) {
          this.addFocusEntity(edge.source, focus);
          this.addFocusEntity(edge.target, focus);
        }
      });
      return focus;
    }

    if (selected.visualType === 'service-badge') {
      edges.forEach((edge) => {
        if (edge.source === selected.id || edge.target === selected.id) {
          focus.edgeIds.add(edge.id);
          this.addFocusEntity(edge.source, focus);
          this.addFocusEntity(edge.target, focus);
        }
      });
      return focus;
    }

    const relatedEntityIds = new Set([selected.id]);
    if (selected.parentNodeId) {
      relatedEntityIds.add(selected.parentNodeId);
    } else {
      (this.data.embeddedNodes || []).forEach((item) => {
        if (item.parentNodeId === selected.id) {
          relatedEntityIds.add(item.id);
        }
      });
    }

    edges.forEach((edge) => {
      if (relatedEntityIds.has(edge.source) || relatedEntityIds.has(edge.target)) {
        focus.edgeIds.add(edge.id);
        this.addFocusEntity(edge.source, focus);
        this.addFocusEntity(edge.target, focus);
      }
    });

    return focus;
  }

  getNarrativeWeight(entity) {
    if (typeof entity.narrativeWeight === 'number') return entity.narrativeWeight;

    if (entity.visualType === 'actor') {
      return this.data.narrativeWeight?.actors?.[entity.id] ?? 0.7;
    }
    if (entity.visualType === 'service-badge') {
      return this.data.narrativeWeight?.serviceBadges?.[entity.id] ?? 0.55;
    }

    return this.data.narrativeWeight?.nodes?.[entity.id] ?? 0.7;
  }

  addFocusEntity(entityId, focus) {
    const group = this.getRenderedGroup(entityId);
    if (group) {
      (group.nodeIds || []).forEach((nodeId) => focus.nodeIds.add(nodeId));
      return;
    }

    const entity = this.getEntityById(entityId);
    if (entity?.parentNodeId) {
      focus.nodeIds.add(entity.parentNodeId);
      return;
    }

    focus.nodeIds.add(entityId);
  }

  getZoneEmphasis(zoneId, scenario) {
    const byScenario = scenario?.zoneEmphasis?.[zoneId];
    if (typeof byScenario === 'number') return byScenario;

    const byMode = this.data.zoneEmphasis?.byViewMode?.[this.state.viewMode]?.[zoneId];
    if (typeof byMode === 'number') return byMode;

    return this.data.zoneEmphasis?.default?.[zoneId] ?? 1;
  }

  getNodeVisualType(node) {
    if (node.visualType) return node.visualType;
    if (node.entityKind === 'actor') return 'actor';
    if (node.entityKind === 'service-badge') return 'service-badge';
    if (this.serviceNodeIds.has(node.id) || node.externalCard) return 'service';
    return 'build';
  }

  resolveNodeOverlaps(nodes, groupByNode = this.nodeGroupById, ringById = this.ringsById) {
    const arranged = nodes.map((node) => ({
      ...node,
      bounds: { ...node.bounds },
    }));

    arranged.forEach((node) => {
      if (!node.isFloating) {
        this.constrainNodeToGroup(node, groupByNode);
      }
      this.constrainNodeToZone(node, ringById);
    });

    if (this.data.layout?.preserveManualPositions) {
      arranged.forEach((node) => {
        node.zoneViolation = !this.isNodeInsideZone(node, ringById);
      });
      return arranged;
    }

    const iterations = 72;
    const padding = 14;

    for (let step = 0; step < iterations; step += 1) {
      let moved = false;

      for (let i = 0; i < arranged.length; i += 1) {
        for (let j = i + 1; j < arranged.length; j += 1) {
          const a = arranged[i];
          const b = arranged[j];
          if (a.isFloating && b.isFloating) continue;
          const delta = this.getOverlapSeparation(a, b, padding);
          if (!delta) continue;

          moved = true;
          this.shiftNodeBounds(a, -delta.dx / 2, -delta.dy / 2);
          this.shiftNodeBounds(b, delta.dx / 2, delta.dy / 2);

          if (!a.isFloating) this.constrainNodeToGroup(a, groupByNode);
          if (!b.isFloating) this.constrainNodeToGroup(b, groupByNode);
          this.constrainNodeToZone(a, ringById);
          this.constrainNodeToZone(b, ringById);
        }
      }

      if (!moved) break;
    }

    arranged.forEach((node) => {
      node.zoneViolation = !this.isNodeInsideZone(node, ringById);
    });

    return arranged;
  }

  getOverlapSeparation(nodeA, nodeB, padding) {
    const a = nodeA.bounds;
    const b = nodeB.bounds;

    const axCenter = a.x + a.width / 2;
    const ayCenter = a.y + a.height / 2;
    const bxCenter = b.x + b.width / 2;
    const byCenter = b.y + b.height / 2;
    const dx = bxCenter - axCenter;
    const dy = byCenter - ayCenter;

    const overlapX = a.width / 2 + b.width / 2 + padding - Math.abs(dx);
    const overlapY = a.height / 2 + b.height / 2 + padding - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return null;

    if (overlapX < overlapY) {
      const sign = dx === 0 ? (nodeA.id < nodeB.id ? -1 : 1) : Math.sign(dx);
      return { dx: overlapX * sign, dy: 0 };
    }

    const sign = dy === 0 ? (nodeA.id < nodeB.id ? -1 : 1) : Math.sign(dy);
    return { dx: 0, dy: overlapY * sign };
  }

  shiftNodeBounds(node, dx, dy) {
    node.bounds.x += dx;
    node.bounds.y += dy;
    node.bounds.cx = node.bounds.x + node.bounds.width / 2;
    node.bounds.cy = node.bounds.y + node.bounds.height / 2;
  }

  constrainNodeToGroup(node, groupByNode = this.nodeGroupById) {
    const group = groupByNode.get(node.id);
    if (!group) return;

    const paddingX = 10;
    const paddingYTop = 38;
    const paddingYBottom = 12;
    const maxX = group.x + group.width - node.bounds.width - paddingX;
    const maxY = group.y + group.height - node.bounds.height - paddingYBottom;

    node.bounds.x = this.clamp(node.bounds.x, group.x + paddingX, Math.max(group.x + paddingX, maxX));
    node.bounds.y = this.clamp(node.bounds.y, group.y + paddingYTop, Math.max(group.y + paddingYTop, maxY));
    node.bounds.cx = node.bounds.x + node.bounds.width / 2;
    node.bounds.cy = node.bounds.y + node.bounds.height / 2;
  }

  constrainNodeToZone(node, ringById = this.ringsById) {
    if (node.allowOutsideZone) return;
    const ring = ringById.get(node.zone);
    if (!ring) return;

    const margin = 12;
    const maxRx = ring.rx - node.bounds.width / 2 - margin;
    const maxRy = ring.ry - node.bounds.height / 2 - margin;
    if (maxRx <= 0 || maxRy <= 0) return;

    const centerX = this.data.canvas.centerX;
    const centerY = this.data.canvas.centerY;
    const dx = node.bounds.cx - centerX;
    const dy = node.bounds.cy - centerY;
    const norm = (dx * dx) / (maxRx * maxRx) + (dy * dy) / (maxRy * maxRy);

    if (norm <= 1) return;

    const factor = (1 / Math.sqrt(norm)) * 0.986;
    node.bounds.cx = centerX + dx * factor;
    node.bounds.cy = centerY + dy * factor;
    node.bounds.x = node.bounds.cx - node.bounds.width / 2;
    node.bounds.y = node.bounds.cy - node.bounds.height / 2;
  }

  isNodeInsideZone(node, ringById = this.ringsById) {
    const ring = ringById.get(node.zone);
    if (!ring) return true;

    const margin = 6;
    const maxRx = ring.rx - node.bounds.width / 2 - margin;
    const maxRy = ring.ry - node.bounds.height / 2 - margin;
    if (maxRx <= 0 || maxRy <= 0) return false;

    const dx = node.bounds.cx - this.data.canvas.centerX;
    const dy = node.bounds.cy - this.data.canvas.centerY;
    const norm = (dx * dx) / (maxRx * maxRx) + (dy * dy) / (maxRy * maxRy);
    return norm <= 1;
  }

  isNodeRelevantForFilter(node, filteredRelevantNodes) {
    if (node.visualType === 'actor') return true;
    if (this.state.filter === 'all') return true;
    if (filteredRelevantNodes.has(node.id)) return true;

    if (this.state.filter === 'pii') {
      return node.dataClass === 'pii' || node.dataClass === 'mixed';
    }

    return node.dataClass !== 'pii';
  }

  validateSelection(model) {
    if (!this.state.selectedType || !this.state.selectedId) return;

    const selectionMissing =
      (this.state.selectedType === 'group' && !model.groupIdSet.has(this.state.selectedId)) ||
      (this.state.selectedType === 'node' && !model.nodeIdSet.has(this.state.selectedId)) ||
      (this.state.selectedType === 'edge' && !model.edgeIdSet.has(this.state.selectedId)) ||
      (this.state.selectedType === 'embedded' && !model.embeddedIdSet.has(this.state.selectedId));

    if (selectionMissing) {
      this.state.selectedType = null;
      this.state.selectedId = null;
    }
  }

  renderRings(model) {
    const { centerX, centerY } = this.data.canvas;
    const rings = model.rings?.length ? model.rings : this.getEnabledItems(this.data.rings);

    rings.forEach((ring) => {
      const ellipse = this.createSvgElement('ellipse', {
        class: `zone-ring ${ring.className}`,
        cx: centerX,
        cy: centerY,
        rx: ring.rx,
        ry: ring.ry,
        'data-emphasis': String(ring.emphasis),
      });
      ellipse.style.opacity = String(this.clamp(ring.emphasis || 1, 0.18, 1));
      this.elements.ringsLayer.appendChild(ellipse);

      const label = this.createSvgElement('text', {
        class: 'zone-label',
        x: centerX,
        y: centerY - ring.ry + ring.labelOffsetY,
      });
      label.style.opacity = String(this.clamp((ring.emphasis || 1) + 0.06, 0.3, 1));
      label.textContent = ring.title;
      this.elements.ringsLayer.appendChild(label);
    });
  }

  renderGroups(model) {
    const groups = model.groups?.length ? model.groups : this.getEnabledItems(this.data.groups);
    groups.forEach((group) => {
      const isSelectable = Boolean(group.selectable);
      const isSelected = this.state.selectedType === 'group' && this.state.selectedId === group.id;
      const wrapper = this.createSvgElement('g', {
        class: `cluster-group ${isSelectable ? 'is-selectable' : ''} ${isSelected ? 'is-selected' : ''}`,
      });

      wrapper.appendChild(
        this.createSvgElement('rect', {
          class: 'cluster-box',
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
        })
      );

      const titleLines = this.wrapGroupLabel(group.label, 34);
      titleLines.forEach((line, index) => {
        const title = this.createSvgElement('text', {
          class: 'cluster-title',
          x: group.x + 14,
          y: group.y + 22 + index * 13,
        });
        title.textContent = line;
        wrapper.appendChild(title);
      });

      if (isSelectable) {
        const tooltipText = group.shortDescription || group.description || group.label;
        const titleHeight = Math.max(40, 18 + titleLines.length * 13);
        const hitTarget = this.createSvgElement('rect', {
          class: 'cluster-hitbox',
          x: group.x,
          y: group.y,
          width: group.width,
          height: titleHeight,
          tabindex: 0,
          role: 'button',
          'data-interactive': 'true',
          'aria-label': `Container ${group.label}, Zone ${this.getZoneTitle(group.zone)}, ${group.nodeIds?.length || 0} Bausteine`,
        });
        const selectGroup = (event) => {
          event.stopPropagation();
          this.selectGroup(group.id);
        };

        hitTarget.addEventListener('click', selectGroup);
        hitTarget.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectGroup(event);
          }
        });
        hitTarget.addEventListener('mouseenter', (event) => {
          this.showTooltip(tooltipText, event.clientX, event.clientY);
        });
        hitTarget.addEventListener('mousemove', (event) => {
          this.moveTooltip(event.clientX, event.clientY);
        });
        hitTarget.addEventListener('mouseleave', () => this.hideTooltip());
        hitTarget.addEventListener('focus', () => this.showTooltipNearElement(tooltipText, hitTarget));
        hitTarget.addEventListener('blur', () => this.hideTooltip());
        wrapper.appendChild(hitTarget);
      }

      this.elements.groupsLayer.appendChild(wrapper);
    });
  }

  renderEdges(model) {
    const entityMap = new Map(model.nodes.map((node) => [node.id, node]));
    model.embeddedNodes.forEach((item) => {
      entityMap.set(item.id, item);
    });
    model.groups.forEach((group) => {
      entityMap.set(group.id, {
        ...group,
        bounds: {
          x: group.x,
          y: group.y,
          width: group.width,
          height: group.height,
          cx: group.x + group.width / 2,
          cy: group.y + group.height / 2,
        },
      });
    });

    model.edges.forEach((edge) => {
      const sourceNode = entityMap.get(edge.source);
      const targetNode = entityMap.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const geometry = this.buildEdgeGeometry(sourceNode.bounds, targetNode.bounds);
      const isSelected = this.state.selectedType === 'edge' && this.state.selectedId === edge.id;

      const group = this.createSvgElement('g', {
        class: `edge-group ${edge.isDimmed ? 'is-dimmed' : ''} ${isSelected ? 'is-selected' : ''} ${edge.isOptional ? 'is-optional' : ''}`,
        'data-interactive': 'true',
      });

      const hitPath = this.createSvgElement('path', {
        class: 'edge-hit',
        d: geometry.path,
        tabindex: 0,
        role: 'button',
        'aria-label': `Datenfluss ${edge.label}: ${this.getEntityLabel(edge.source)} zu ${this.getEntityLabel(edge.target)}`,
        'data-interactive': 'true',
      });

      const visiblePath = this.createSvgElement('path', {
        class: `edge-path ${edge.dataClass} ${edge.style}`,
        d: geometry.path,
        'marker-end': `url(#arrow-${edge.dataClass === 'pii' ? 'pii' : 'non-pii'})`,
      });

      const label = this.createSvgElement('text', {
        class: `edge-label ${model.forceEdgeLabels ? 'is-forced' : ''}`,
        x: geometry.labelX,
        y: geometry.labelY,
      });
      label.textContent = edge.label;

      const bindSelect = (event) => {
        event.stopPropagation();
        this.selectEdge(edge.id);
      };

      hitPath.addEventListener('click', bindSelect);
      hitPath.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          bindSelect(event);
        }
      });

      hitPath.addEventListener('mouseenter', (event) => {
        this.showTooltip(`${edge.label} (${edge.dataClass.toUpperCase()})`, event.clientX, event.clientY);
      });
      hitPath.addEventListener('mousemove', (event) => {
        this.moveTooltip(event.clientX, event.clientY);
      });
      hitPath.addEventListener('mouseleave', () => this.hideTooltip());
      hitPath.addEventListener('focus', () => {
        this.showTooltipNearElement(`${edge.label} (${edge.dataClass.toUpperCase()})`, hitPath);
      });
      hitPath.addEventListener('blur', () => this.hideTooltip());

      group.appendChild(hitPath);
      group.appendChild(visiblePath);
      group.appendChild(label);
      this.elements.edgesLayer.appendChild(group);
    });
  }

  renderNodes(model) {
    model.nodes.forEach((node) => {
      const isSelected = this.state.selectedType === 'node' && this.state.selectedId === node.id;
      const zoneTitle = this.getZoneTitle(node.zone);
      const visualType = this.getNodeVisualType(node);
      const nodeRoleClass =
        visualType === 'platform'
          ? 'is-platform'
          : visualType === 'service-badge'
            ? 'is-service-badge'
            : visualType === 'actor'
              ? 'is-actor'
              : visualType === 'service'
                ? 'is-service'
                : 'is-build';

      const group = this.createSvgElement('g', {
        class: `node-group ${nodeRoleClass} ${node.isDimmed ? 'is-dimmed' : ''} ${isSelected ? 'is-selected' : ''} ${node.optional ? 'is-optional' : ''} ${node.externalCard ? 'is-external' : ''} ${node.zoneViolation ? 'is-zone-violation' : ''}`,
        transform: `translate(${node.bounds.x} ${node.bounds.y})`,
        tabindex: 0,
        role: 'button',
        'aria-label': `Element ${node.label}, Zone ${zoneTitle}, Datenklasse ${this.formatDataClass(node.dataClass)}`,
        'data-interactive': 'true',
        'data-data-class': node.dataClass,
      });

      if (visualType === 'actor') {
        this.renderActorNode(group, node);
      } else if (visualType === 'service-badge') {
        this.renderServiceBadgeNode(group, node);
      } else {
        const lines = this.wrapNodeLabel(node.displayLabel || node.label, 22);
        const isServiceNode = visualType === 'service';
        const nodeRadius = isServiceNode ? 30 : visualType === 'platform' ? 20 : 14;

        group.appendChild(
          this.createSvgElement('rect', {
            class: 'node-rect',
            width: node.bounds.width,
            height: node.bounds.height,
            rx: nodeRadius,
            ry: nodeRadius,
          })
        );

        if (visualType === 'platform') {
          // custom renderer below
        } else if (!isServiceNode) {
          group.appendChild(
            this.createSvgElement('rect', {
              class: `node-class-strip ${node.dataClass}`,
              x: 0,
              y: 0,
              width: 6,
              height: node.bounds.height,
            })
          );
        } else if (!node.hideServiceMarker) {
          group.appendChild(
            this.createSvgElement('circle', {
              class: `node-service-dot ${node.dataClass}`,
              cx: node.bounds.width - 18,
              cy: 18,
              r: 8,
            })
          );
          const marker = this.createSvgElement('text', {
            class: 'node-service-mark',
            x: node.bounds.width - 18,
            y: 21.5,
          });
          marker.textContent = 'S';
          group.appendChild(marker);
        }

        if (node.renderKind === 'moodle-shell') {
          this.renderMoodleShellNode(group, node, model);
        } else if (node.logoSrc && visualType !== 'platform') {
          this.renderLogoNode(group, node);
        } else {
          const lineStartY = lines.length === 1 ? 42 : 33;
          lines.forEach((line, index) => {
            const title = this.createSvgElement('text', {
              class: 'node-title',
              x: isServiceNode ? 18 : 15,
              y: lineStartY + index * 18,
            });
            title.textContent = line;
            group.appendChild(title);
          });

          if (node.icon) {
            const icon = this.createSvgElement('text', {
              class: 'node-icon',
              x: node.bounds.width - 42,
              y: 24,
            });
            icon.textContent = node.icon;
            group.appendChild(icon);
          }
        }
      }

      const selectNode = (event) => {
        event.stopPropagation();
        this.selectNode(node.id);
      };

      group.addEventListener('click', selectNode);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectNode(event);
        }
      });

      group.addEventListener('mouseenter', (event) => {
        this.showTooltip(node.shortDescription || node.label, event.clientX, event.clientY);
      });
      group.addEventListener('mousemove', (event) => {
        this.moveTooltip(event.clientX, event.clientY);
      });
      group.addEventListener('mouseleave', () => this.hideTooltip());
      group.addEventListener('focus', () => this.showTooltipNearElement(node.shortDescription || node.label, group));
      group.addEventListener('blur', () => this.hideTooltip());

      this.elements.nodesLayer.appendChild(group);
    });
  }

  renderActorNode(group, node) {
    const markerScale = Math.max(1, node.markerScale || 1);
    const avatarRadius = 18 * markerScale;
    const titleFontSize = 0.76 + (markerScale - 1) * 0.12;

    group.appendChild(
      this.createSvgElement('rect', {
        class: 'actor-hitbox',
        x: 0,
        y: 0,
        width: node.bounds.width,
        height: node.bounds.height,
      })
    );

    const avatarCx = node.bounds.width / 2;
    const avatarCy = avatarRadius + 8;

    group.appendChild(
      this.createSvgElement('circle', {
        class: 'actor-avatar',
        cx: avatarCx,
        cy: avatarCy,
        r: avatarRadius,
      })
    );

    if (node.avatarIcon) {
      group.appendChild(this.createActorAvatarIcon(node.avatarIcon, avatarCx, avatarCy, markerScale));
    } else {
      const avatarText = this.createSvgElement('text', {
        class: 'actor-avatar-text',
        x: avatarCx,
        y: avatarCy + 4.2 * markerScale,
        style: `font-size: ${0.7 + (markerScale - 1) * 0.16}rem;`,
      });
      avatarText.textContent = node.avatar || 'A';
      group.appendChild(avatarText);
    }

    const title = this.createSvgElement('text', {
      class: 'actor-title',
      x: avatarCx,
      y: node.bounds.height - 8,
      style: `font-size: ${titleFontSize}rem;`,
    });
    title.textContent = node.shortLabel || node.label;
    group.appendChild(title);
  }

  createActorAvatarIcon(iconId, cx, cy, scale = 1) {
    const iconGroup = this.createSvgElement('g', {
      class: 'actor-avatar-icon',
      transform: `translate(${cx} ${cy}) scale(${scale})`,
      'aria-hidden': 'true',
    });

    if (iconId === 'person') {
      iconGroup.appendChild(
        this.createSvgElement('circle', {
          class: 'actor-avatar-icon-head',
          cx: 0,
          cy: -4.8,
          r: 4.1,
        })
      );
      iconGroup.appendChild(
        this.createSvgElement('path', {
          class: 'actor-avatar-icon-body',
          d: 'M -7.2 7 C -7.2 2.6 -3.9 0 0 0 C 3.9 0 7.2 2.6 7.2 7',
        })
      );
      return iconGroup;
    }

    const fallbackText = this.createSvgElement('text', {
      class: 'actor-avatar-text',
      x: 0,
      y: 4,
    });
    fallbackText.textContent = 'A';
    iconGroup.appendChild(fallbackText);
    return iconGroup;
  }

  renderServiceBadgeNode(group, node) {
    if (node.renderKind === 'logo-orb') {
      const orbRadius = Math.min(node.circleRadius || 30, Math.min(node.bounds.width, node.bounds.height - 28) / 2);
      const titleLines = this.wrapGroupLabel(node.displayLabel || node.label, 18);
      titleLines.forEach((line, index) => {
        const title = this.createSvgElement('text', {
          class: 'service-badge-title service-badge-title--above',
          x: node.bounds.width / 2,
          y: 12 + index * 12,
        });
        title.textContent = line;
        group.appendChild(title);
      });

      const orbCenterY = node.orbCenterY || (titleLines.length > 1 ? node.bounds.height - orbRadius - 8 : node.bounds.height - orbRadius - 10);
      group.appendChild(
        this.createSvgElement('circle', {
          class: 'service-badge-orb',
          cx: node.bounds.width / 2,
          cy: orbCenterY,
          r: orbRadius,
        })
      );

      if (node.logoSrc) {
        const logoWidth = Math.min(node.logoWidth || 32, orbRadius * 1.45);
        const logoHeight = Math.min(node.logoHeight || 32, orbRadius * 1.45);
        group.appendChild(
          this.createSvgElement('image', {
            class: 'service-badge-logo service-badge-logo--orb',
            x: node.bounds.width / 2 - logoWidth / 2,
            y: orbCenterY - logoHeight / 2,
            width: logoWidth,
            height: logoHeight,
            preserveAspectRatio: 'xMidYMid meet',
            href: node.logoSrc,
          })
        );
      }

      return;
    }

    const radius = node.shape === 'round' ? Math.min(node.bounds.height / 2, 31) : 28;

    group.appendChild(
      this.createSvgElement('rect', {
        class: 'service-badge-rect',
        x: 0,
        y: 0,
        width: node.bounds.width,
        height: node.bounds.height,
        rx: radius,
        ry: radius,
      })
    );

    if (node.logoSrc) {
      const logoWidth = Math.min(node.logoWidth || 88, node.bounds.width - 22);
      const logoHeight = Math.min(node.logoHeight || 20, node.bounds.height - 24);
      const logoX = (node.bounds.width - logoWidth) / 2;
      const logoY = 8;
      group.appendChild(
        this.createSvgElement('image', {
          class: 'service-badge-logo',
          x: logoX,
          y: logoY,
          width: logoWidth,
          height: logoHeight,
          preserveAspectRatio: 'xMidYMid meet',
          href: node.logoSrc,
        })
      );
    }

    const title = this.createSvgElement('text', {
      class: 'service-badge-title',
      x: node.bounds.width / 2,
      y: node.logoSrc ? node.bounds.height - 12 : 26,
    });
    title.textContent = node.displayLabel || node.label;
    group.appendChild(title);

    if (node.optional) {
      const tag = this.createSvgElement('text', {
        class: 'service-badge-tag',
        x: node.bounds.width - 10,
        y: 16,
      });
      tag.textContent = 'optional';
      group.appendChild(tag);
    }

    if (node.badgePills && node.badgePills.length) {
      const line = this.createSvgElement('text', {
        class: 'service-badge-pills',
        x: node.bounds.width / 2,
        y: node.bounds.height - 10,
      });
      line.textContent = node.badgePills.slice(0, 3).join(' / ');
      group.appendChild(line);
    }
  }

  renderInspector() {
    const selected = this.getSelectedEntity();

    if (!selected) {
      this.elements.inspectorTitle.textContent = 'Argumente & AP-Bezug';
      this.elements.inspectorSubtitle.textContent =
        'Nutzen, Datenschutz, Policies und Auftraggeber-APs zur aktuellen Auswahl.';
      this.elements.inspectorContent.innerHTML = this.renderInspectorEmpty();
      this.syncControls();
      return;
    }

    if (selected.type === 'group') {
      this.renderGroupInspector(selected.entity);
    } else if (selected.type === 'node' || selected.type === 'embedded') {
      this.renderNodeInspector(selected.entity);
    } else {
      this.renderEdgeInspector(selected.entity);
    }

    this.syncControls();
  }

  renderInspectorEmpty() {
    const scenario = this.getCurrentScenario();
    const summary = this.getCurrentScenarioSummary();

    return this.withApReference(
      `
      <section class="inspector-empty">
        <p><strong>${this.escapeHtml(this.getCurrentViewMode()?.label || 'Praesentationsansicht')} - ${this.escapeHtml(scenario?.label || '')}</strong></p>
        <p>${this.escapeHtml(scenario?.description || '')}</p>
      </section>

      <section class="section">
        <h3>Argumentationslinie</h3>
        <p>${this.escapeHtml(summary.whatHappens || '')}</p>
      </section>

      <section class="section">
        <h3>AP-Bezug</h3>
        <p>${this.escapeHtml(summary.whyRelevant || '')}</p>
      </section>

      <section class="section">
        <h3>Datenschutzsignal</h3>
        <p>${this.escapeHtml(summary.localData || '')}</p>
      </section>

      <section class="section">
        <h3>Optionale Erweiterung</h3>
        <p>${this.escapeHtml(summary.optionalServices || '')}</p>
      </section>

      ${this.renderStorylineSection()}
      ${this.renderVisualGuideSection()}
      ${this.renderSecurityPrinciplesSection()}
      `,
      { scenario }
    );
  }

  renderNodeInspector(node) {
    const visualType = this.getNodeVisualType(node);
    const typeLabel =
      visualType === 'actor' ? 'Akteur' : visualType === 'service-badge' ? 'Optionaler Service' : 'Komponente';
    this.elements.inspectorTitle.textContent = node.label;
    this.elements.inspectorSubtitle.textContent = `${typeLabel} | ${this.getZoneTitle(node.zone)}`;

    if (visualType === 'actor') {
      if (this.state.activeTab === 'flows') {
        this.elements.inspectorContent.innerHTML = this.renderActorFlowsTab(node);
      } else if (this.state.activeTab === 'security') {
        this.elements.inspectorContent.innerHTML = this.renderActorSecurityTab(node);
      } else {
        this.elements.inspectorContent.innerHTML = this.renderActorInfoTab(node);
      }
      return;
    }

    if (visualType === 'service-badge') {
      if (this.state.activeTab === 'flows') {
        this.elements.inspectorContent.innerHTML = this.renderServiceFlowsTab(node);
      } else if (this.state.activeTab === 'security') {
        this.elements.inspectorContent.innerHTML = this.renderServiceSecurityTab(node);
      } else {
        this.elements.inspectorContent.innerHTML = this.renderServiceInfoTab(node);
      }
      return;
    }

    if (this.state.activeTab === 'info') {
      this.elements.inspectorContent.innerHTML = this.renderNodeInfoTab(node);
      return;
    }

    if (this.state.activeTab === 'flows') {
      this.elements.inspectorContent.innerHTML = this.renderNodeFlowsTab(node);
      return;
    }

    this.elements.inspectorContent.innerHTML = this.renderNodeSecurityTab(node);
  }

  renderGroupInspector(group) {
    this.elements.inspectorTitle.textContent = group.label;
    this.elements.inspectorSubtitle.textContent = `Architektur-Container | ${this.getZoneTitle(group.zone)}`;

    if (this.state.activeTab === 'flows') {
      this.elements.inspectorContent.innerHTML = this.renderGroupFlowsTab(group);
      return;
    }

    if (this.state.activeTab === 'security') {
      this.elements.inspectorContent.innerHTML = this.renderGroupSecurityTab(group);
      return;
    }

    this.elements.inspectorContent.innerHTML = this.renderGroupInfoTab(group);
  }

  renderEdgeInspector(edge) {
    this.elements.inspectorTitle.textContent = edge.label;
    this.elements.inspectorSubtitle.textContent = `Datenfluss | ${edge.optional ? 'Optional' : 'Kernpfad'} | ${this.formatDataClass(edge.dataClass)}`;

    if (this.state.activeTab === 'info') {
      this.elements.inspectorContent.innerHTML = this.renderEdgeInfoTab(edge);
      return;
    }

    if (this.state.activeTab === 'flows') {
      this.elements.inspectorContent.innerHTML = this.renderEdgeFlowsTab(edge);
      return;
    }

    this.elements.inspectorContent.innerHTML = this.renderEdgeSecurityTab(edge);
  }

  renderGroupInfoTab(group) {
    const nodes = this.getGroupNodes(group);

    return this.withApReference(
      `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Sicherheitszone</span>
          <span>${this.escapeHtml(this.getZoneTitle(group.zone))}</span>
        </div>
        <div class="meta-item">
          <span>Abgedeckte Bausteine</span>
          <span>${nodes.length}</span>
        </div>
      </section>

      <section class="section">
        <h3>Was ist das?</h3>
        <p>${this.escapeHtml(group.shortDescription || group.description || 'Keine Beschreibung hinterlegt.')}</p>
      </section>

      <section class="section">
        <h3>Rolle in der Architektur</h3>
        ${this.renderList(group.purpose || [])}
      </section>

      <section class="section">
        <h3>Abgedeckte Bausteine</h3>
        ${this.renderEntityReferenceList(nodes, {
          emptyText: 'Keine sichtbaren Bausteine im aktuellen Filter/Szenario.',
          buttonLabel: 'Baustein oeffnen',
          attributeName: 'data-select-node',
        })}
      </section>

      <section class="section">
        <h3>Warum relevant?</h3>
        <p>${this.escapeHtml(group.inspectorSummary?.relevance || group.description || '')}</p>
      </section>
      `,
      { entity: group }
    );
  }

  renderGroupFlowsTab(group) {
    const nodes = this.getGroupNodes(group);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = this.getGroupEdges(group);
    const internalEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const connectedEdges = edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));

    return this.withApReference(
      `
      <section class="section">
        <h3>Wie arbeitet der Container?</h3>
        <p>${this.escapeHtml(group.flowSummary || group.description || '')}</p>
      </section>

      ${this.renderEdgeReferenceSection(
        'Interne Daten- und Funktionspfade',
        internalEdges,
        'Keine internen Pfade im aktuellen Filter/Szenario sichtbar.'
      )}
      ${this.renderEdgeReferenceSection(
        'Angebundene Uebergaben',
        connectedEdges,
        'Keine angebundenen Uebergaben im aktuellen Filter/Szenario sichtbar.'
      )}

      <section class="section">
        <h3>Beteiligte Bausteine</h3>
        ${this.renderEntityReferenceList(nodes, {
          emptyText: 'Keine sichtbaren Bausteine im aktuellen Filter/Szenario.',
          buttonLabel: 'Baustein oeffnen',
          attributeName: 'data-select-node',
        })}
      </section>
      `,
      { entity: group }
    );
  }

  renderGroupSecurityTab(group) {
    const nodes = this.getGroupNodes(group);
    const renderedNodes = nodes.map((node) => this.getRenderedNode(node.id)).filter(Boolean);
    const zoneViolations = renderedNodes.filter((node) => node.zoneViolation);
    const zoneMessage = zoneViolations.length
      ? `Pruefen: ${zoneViolations.map((node) => node.label).join(', ')} liegen aktuell ausserhalb ihrer zugewiesenen Zone.`
      : 'Erfuellt: Alle sichtbaren Bausteine dieses Containers liegen innerhalb ihrer zugewiesenen Sicherheitszone.';

    return this.withApReference(
      `
      <section class="section">
        <h3>Datenschutzsignal</h3>
        <p>${this.escapeHtml(group.inspectorSummary?.localData || group.description || '')}</p>
      </section>

      <section class="section">
        <h3>Governance</h3>
        <p>${this.escapeHtml(group.inspectorSummary?.governance || '')}</p>
      </section>

      <section class="section">
        <h3>Zoneneinhaltung</h3>
        <p>${this.escapeHtml(zoneMessage)}</p>
      </section>

      <section class="section">
        <h3>Sicherheits-/Governance-Hinweise</h3>
        ${this.renderList(group.securityNotes || [])}
      </section>

      ${this.renderSecurityPrinciplesSection()}
      `,
      { entity: group }
    );
  }

  renderNodeInfoTab(node) {
    return this.withApReference(
      `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Sicherheitszone</span>
          <span>${this.escapeHtml(this.getZoneTitle(node.zone))}</span>
        </div>
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(node.dataClass)}</span>
        </div>
      </section>

      <section class="section">
        <h3>Was ist das?</h3>
        <p>${this.escapeHtml(node.shortDescription || 'Keine Beschreibung hinterlegt.')}</p>
      </section>

      <section class="section">
        <h3>Wozu dient es?</h3>
        ${this.renderList(node.purpose || [])}
      </section>

      <section class="section">
        <h3>Eingaben</h3>
        ${this.renderList(node.inputs || [])}
      </section>

      <section class="section">
        <h3>Ausgaben</h3>
        ${this.renderList(node.outputs || [])}
      </section>

      <section class="section">
        <h3>Sicherheits-/Governance-Hinweise</h3>
        ${this.renderList(node.securityNotes || [])}
      </section>
      `,
      { entity: node }
    );
  }

  renderNodeFlowsTab(node) {
    const edges = this.currentModel ? this.currentModel.edges : [];
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);

    const section = (title, list) => {
      if (!list.length) {
        return `
          <section class="section">
            <h3>${title}</h3>
            <p>Keine aktiven Datenfluesse im aktuellen Filter/Szenario.</p>
          </section>
        `;
      }

      return `
        <section class="section">
          <h3>${title}</h3>
          <ul class="flow-list">
            ${list
              .map(
                (edge) => `
              <li class="flow-item">
                <div class="flow-main">
                  <span>${this.escapeHtml(edge.label)}</span>
                  ${this.dataBadge(edge.dataClass)}
                </div>
                <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))} -> ${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
                <button type="button" class="flow-select" data-select-edge="${edge.id}">Im Inspector oeffnen</button>
              </li>
            `
              )
              .join('')}
          </ul>
        </section>
      `;
    };

    return this.withApReference(`${section('Eingehende Fluesse', incoming)}${section('Ausgehende Fluesse', outgoing)}`, {
      entity: node,
    });
  }

  renderNodeSecurityTab(node) {
    const renderedNode = this.getRenderedNode(node.id);
    const zoneCheckOk = renderedNode ? !renderedNode.zoneViolation : true;

    return this.withApReference(
      `
      <section class="section">
        <h3>Zoneneinhaltung</h3>
        <p>${zoneCheckOk ? 'Erfuellt: Das Element liegt innerhalb seiner Sicherheitszone.' : 'Pruefen: Dieses Element liegt aktuell ausserhalb seiner Zone.'}</p>
      </section>
      <section class="section">
        <h3>Sicherheits-/Governance-Hinweise</h3>
        ${this.renderList(node.securityNotes || [])}
      </section>
      ${this.renderZoneComplianceSection()}
      ${this.renderSecurityPrinciplesSection()}
      `,
      { entity: node }
    );
  }

  renderActorInfoTab(actor) {
    return this.withApReference(
      `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Rolle</span>
          <span>${this.escapeHtml(actor.shortLabel || actor.label)}</span>
        </div>
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(actor.dataClass || 'mixed')}</span>
        </div>
      </section>

      <section class="section">
        <h3>Was ist das?</h3>
        <p>${this.escapeHtml(actor.role || actor.shortDescription || '')}</p>
      </section>

      <section class="section">
        <h3>Wozu dient es?</h3>
        ${this.renderList(actor.purpose || [])}
      </section>

      <section class="section">
        <h3>Welche Daten entstehen?</h3>
        ${this.renderList(actor.dataProduced || [])}
      </section>

      <section class="section">
        <h3>Welche Systeme werden beruehrt?</h3>
        ${this.renderList(actor.systemsTouched || [])}
      </section>

      <section class="section">
        <h3>Warum relevant?</h3>
        <p>${this.escapeHtml(actor.inspectorSummary?.relevance || actor.shortDescription || '')}</p>
      </section>
      `,
      { entity: actor }
    );
  }

  renderActorFlowsTab(actor) {
    const edgeIds = actor.flowEdgeIds || [];
    const edges = edgeIds
      .map((id) => this.currentModel?.edges.find((edge) => edge.id === id) || this.edgesById.get(id))
      .filter(Boolean);

    if (!edges.length) {
      return this.withApReference(
        `
        <section class="section">
          <h3>Relevante Datenfluesse</h3>
          <p>Keine direkt zugeordneten Fluesse im aktuellen Filter.</p>
        </section>
        `,
        { entity: actor }
      );
    }

    return this.withApReference(
      `
      <section class="section">
        <h3>Relevante Datenfluesse</h3>
        <ul class="flow-list">
          ${edges
            .map(
              (edge) => `
            <li class="flow-item">
              <div class="flow-main">
                <span>${this.escapeHtml(edge.label)}</span>
                ${this.dataBadge(edge.dataClass)}
              </div>
              <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))} -> ${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
              <button type="button" class="flow-select" data-select-edge="${edge.id}">Im Inspector oeffnen</button>
            </li>
          `
            )
            .join('')}
        </ul>
      </section>
      `,
      { entity: actor }
    );
  }

  renderActorSecurityTab(actor) {
    return this.withApReference(
      `
      <section class="section">
        <h3>Sicherheitszone</h3>
        <p>${this.escapeHtml(this.getZoneTitle(actor.zone))}</p>
      </section>
      <section class="section">
        <h3>Sicherheits-/Governance-Hinweise</h3>
        ${this.renderList(actor.securityNotes || [])}
      </section>
      ${this.renderSecurityPrinciplesSection()}
      `,
      { entity: actor }
    );
  }

  renderServiceInfoTab(service) {
    return this.withApReference(
      `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Sicherheitszone</span>
          <span>${this.escapeHtml(this.getZoneTitle(service.zone))}</span>
        </div>
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(service.dataClass || 'non-pii')}</span>
        </div>
      </section>

      <section class="section">
        <h3>Was ist das?</h3>
        <p>${this.escapeHtml(service.shortDescription || '')}</p>
      </section>

      <section class="section">
        <h3>Wofuer geeignet?</h3>
        ${this.renderList(service.purpose || [])}
      </section>

      <section class="section">
        <h3>Warum optional?</h3>
        <p>${service.optional ? 'Der Service kann je nach Betriebsmodus aktiviert oder deaktiviert werden.' : 'Dieser Service ist Bestandteil der Kernarchitektur.'}</p>
      </section>

      <section class="section">
        <h3>Welche Datenklasse ist erlaubt?</h3>
        <p>${this.escapeHtml(service.allowedDataClass ? this.formatDataClass(service.allowedDataClass) : 'non-PII')}</p>
      </section>

      <section class="section">
        <h3>Welche Policy gilt?</h3>
        <p>${this.escapeHtml(service.policy || 'Nur ueber die LMS AI Workflow Engine, mit Logging und Freigaberegeln.')}</p>
      </section>
      `,
      { entity: service }
    );
  }

  renderServiceFlowsTab(service) {
    const edges = (this.currentModel?.edges || []).filter(
      (edge) => edge.source === service.id || edge.target === service.id
    );

    if (!edges.length) {
      return this.withApReference(
        `
        <section class="section">
          <h3>Relevante Datenfluesse</h3>
          <p>Keine aktiven Fluesse im aktuellen Filter/Szenario.</p>
        </section>
        `,
        { entity: service }
      );
    }

    return this.withApReference(
      `
      <section class="section">
        <h3>Relevante Datenfluesse</h3>
        <ul class="flow-list">
          ${edges
            .map(
              (edge) => `
            <li class="flow-item">
              <div class="flow-main">
                <span>${this.escapeHtml(edge.label)}</span>
                ${this.dataBadge(edge.dataClass)}
              </div>
              <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))} -> ${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
              <button type="button" class="flow-select" data-select-edge="${edge.id}">Im Inspector oeffnen</button>
            </li>
          `
            )
            .join('')}
        </ul>
      </section>
      `,
      { entity: service }
    );
  }

  renderServiceSecurityTab(service) {
    return this.withApReference(
      `
      <section class="section">
        <h3>Sicherheits-/Governance-Hinweise</h3>
        ${this.renderList(service.securityNotes || [])}
      </section>
      <section class="section">
        <h3>Policy</h3>
        <p>${this.escapeHtml(service.policy || 'Policy-gesteuerter Zugriff.')}</p>
      </section>
      ${this.renderSecurityPrinciplesSection()}
      `,
      { entity: service }
    );
  }

  renderEdgeInfoTab(edge) {
    const localOrExternal = this.isExternalEdge(edge) ? 'Teilweise extern (aber nur non-PII).' : 'Lokal innerhalb SDG-Campus/DE-On-Prem.';

    return this.withApReference(
      `
      <section class="meta-grid">
        <div class="meta-item">
          <span>Datenklasse</span>
          <span>${this.dataBadge(edge.dataClass)}</span>
        </div>
        <div class="meta-item">
          <span>Pfadtyp</span>
          <span>${edge.optional ? 'Optional' : 'Kernpfad'}</span>
        </div>
      </section>

      <section class="section">
        <h3>Was fliesst?</h3>
        <p>${this.escapeHtml(edge.label)}</p>
      </section>

      <section class="section">
        <h3>Warum?</h3>
        <p>${this.escapeHtml(edge.why)}</p>
      </section>

      <section class="section">
        <h3>PII oder non-PII?</h3>
        <p>${edge.dataClass === 'pii' ? 'PII' : edge.dataClass === 'non-pii' ? 'non-PII' : this.escapeHtml(this.formatDataClass(edge.dataClass))}</p>
      </section>

      <section class="section">
        <h3>Lokal oder extern?</h3>
        <p>${this.escapeHtml(localOrExternal)}</p>
      </section>

      <section class="section">
        <h3>Welche Policy greift?</h3>
        <p>${this.escapeHtml(edge.policyHint)}</p>
      </section>
      `,
      { entity: edge }
    );
  }

  renderEdgeFlowsTab(edge) {
    return this.withApReference(
      `
      <section class="section">
        <h3>Datenfluss</h3>
        <ul class="flow-list">
          <li class="flow-item">
            <div class="flow-main">
              <span>${this.escapeHtml(edge.label)}</span>
              ${this.dataBadge(edge.dataClass)}
            </div>
            <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))} -> ${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Quelle / Ziel</h3>
        <ul class="flow-list">
          <li class="flow-item">
            <div class="flow-main"><span>Quelle</span></div>
            <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))}</div>
            <button type="button" class="flow-select" data-select-node="${edge.source}">Quelle oeffnen</button>
          </li>
          <li class="flow-item">
            <div class="flow-main"><span>Ziel</span></div>
            <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
            <button type="button" class="flow-select" data-select-node="${edge.target}">Ziel oeffnen</button>
          </li>
        </ul>
      </section>
      `,
      { entity: edge }
    );
  }

  renderEdgeSecurityTab(edge) {
    return this.withApReference(
      `
      <section class="section">
        <h3>Warum erlaubt / nicht erlaubt?</h3>
        <p>${this.escapeHtml(edge.why)}</p>
      </section>

      <section class="section">
        <h3>Policy Hinweis</h3>
        <p>${this.escapeHtml(edge.policyHint)}</p>
      </section>

      ${this.renderSecurityPrinciplesSection()}
      `,
      { entity: edge }
    );
  }

  renderZoneComplianceSection() {
    const violations = this.currentModel?.zoneViolations || [];
    if (!violations.length) {
      return `
        <section class="section">
          <h3>Zonen-Compliance</h3>
          <p>Alle sichtbaren Kernkomponenten liegen innerhalb ihrer zugewiesenen Sicherheitszone.</p>
        </section>
      `;
    }

    return `
      <section class="section">
        <h3>Zonen-Compliance</h3>
        <p>Folgende Komponenten liegen aktuell ausserhalb ihrer Zone:</p>
        <ul>
          ${violations
            .map(
              (node) =>
                `<li>${this.escapeHtml(node.label)} (${this.escapeHtml(this.getZoneTitle(node.zone))})</li>`
            )
            .join('')}
        </ul>
      </section>
    `;
  }

  renderStorylineSection() {
    const steps = this.getCurrentScenario()?.storySteps || [
      'Moodle bleibt der Plattformkern.',
      'PII bleibt lokal in DE/On-Prem.',
      'Externe Services sind optional und workflow-gesteuert.',
    ];

    return `
      <section class="section">
        <h3>In 3 Schritten erklaert</h3>
        <ol class="story-steps">
          ${steps.map((step) => `<li>${this.escapeHtml(step)}</li>`).join('')}
        </ol>
      </section>
    `;
  }

  renderVisualGuideSection() {
    return `
      <section class="section">
        <h3>Leseschluessel</h3>
        <ul>
          <li>Plattform-Karte = bestehendes Kernsystem (Moodle).</li>
          <li>Rechteck = lokaler Architekturbaustein.</li>
          <li>Akteur-Chip = Rolle im Prozess (Lehrende, Studierende, QS/Betrieb).</li>
          <li>Service-Badge = optionale externe Erweiterung.</li>
          <li>Magenta Linie = PII (lokal), Gruen Linie = non-PII.</li>
        </ul>
      </section>
    `;
  }

  renderSecurityPrinciplesSection() {
    return `
      <section class="section">
        <h3>Warum ist das sicher?</h3>
        ${this.renderList(this.data.securityPrinciples || [])}
      </section>
    `;
  }

  withApReference(content, { entity = null, scenario = null, intro = '' } = {}) {
    const apIds = scenario ? this.resolveApIdsForScenario(scenario) : this.resolveApIdsForEntity(entity);
    const defaultIntro = scenario
      ? 'Diese Sicht verweist auf die folgenden Arbeitspakete des Auftraggebers.'
      : 'Diese Auswahl zahlt auf die folgenden Arbeitspakete des Auftraggebers ein.';

    return `${content}${this.renderApReferenceSection(apIds, {
      entity,
      scenario,
      intro: intro || defaultIntro,
    })}`;
  }

  renderApReferenceSection(apIds, { entity = null, scenario = null, intro = '' } = {}) {
    const orderedIds = this.orderApIds(apIds);
    const fallbackIds = orderedIds.length
      ? orderedIds
      : (this.data.apMappingSummary || []).map((entry) => entry.ap);
    const directNote = entity?.apMapping || scenario?.apMapping || '';

    if (!fallbackIds.length && !directNote) return '';

    return `
      <section class="section section--ap-reference">
        <h3>Bezug zu den APs</h3>
        <p class="ap-reference-intro">${this.escapeHtml(intro)}</p>
        <div class="ap-reference-list">
          ${fallbackIds
            .map((apId) => {
              const summary = this.apSummaryById.get(apId);
              return `
                <article class="ap-reference-item">
                  <div class="ap-reference-top">
                    <span class="ap-pill">AP ${this.escapeHtml(apId)}</span>
                    <p class="ap-focus">${this.escapeHtml(summary?.focus || 'Arbeitspaket des Auftraggebers')}</p>
                  </div>
                  ${summary?.components ? `<p class="ap-components">${this.escapeHtml(summary.components)}</p>` : ''}
                </article>
              `;
            })
            .join('')}
        </div>
        ${directNote ? `<p class="ap-direct-note">Direkter Hinweis: ${this.escapeHtml(directNote)}</p>` : ''}
      </section>
    `;
  }

  resolveApIdsForScenario(scenario) {
    const ids = new Set();
    if (!scenario) return ids;

    this.mergeApIds(ids, this.collectDirectApIds(scenario));
    if (ids.size) return ids;

    const scenarioEntityIds = [
      ...(scenario.visibleNodeIds || []),
      ...(scenario.nodeIds || []),
      ...(scenario.visibleActorIds || []),
      ...(scenario.visibleServiceBadgeIds || []),
    ];
    const scenarioEdgeIds = [...(scenario.visibleEdgeIds || []), ...(scenario.edgeIds || [])];

    scenarioEdgeIds.forEach((edgeId) => this.mergeApIds(ids, this.collectDirectApIds(this.edgesById.get(edgeId))));
    scenarioEntityIds.forEach((entityId) => this.mergeApIds(ids, this.resolveApIdsForEntity(this.getEntityById(entityId))));

    return ids;
  }

  resolveApIdsForEntity(entity) {
    const ids = new Set();
    if (!entity) return ids;

    this.mergeApIds(ids, this.collectDirectApIds(entity));

    if (entity.parentNodeId) {
      this.mergeApIds(ids, this.collectDirectApIds(this.getEntityById(entity.parentNodeId)));
    }

    if (entity.source && entity.target) {
      this.mergeApIds(ids, this.collectDirectApIds(this.getEntityById(entity.source)));
      this.mergeApIds(ids, this.collectDirectApIds(this.getEntityById(entity.target)));
    }

    (entity.flowEdgeIds || []).forEach((edgeId) => {
      this.mergeApIds(ids, this.collectDirectApIds(this.edgesById.get(edgeId)));
    });

    (entity.touchNodeIds || []).forEach((nodeId) => {
      this.mergeApIds(ids, this.collectDirectApIds(this.getEntityById(nodeId)));
    });

    (entity.nodeIds || []).forEach((nodeId) => {
      const node = this.getEntityById(nodeId);
      this.mergeApIds(ids, this.collectDirectApIds(node));
      this.getEdgesForEntityId(nodeId).forEach((edge) => {
        this.mergeApIds(ids, this.collectDirectApIds(edge));
      });
    });

    this.getEdgesForEntityId(entity.id).forEach((edge) => {
      this.mergeApIds(ids, this.collectDirectApIds(edge));
    });

    if (!ids.size) {
      this.mergeApIds(ids, this.collectDirectApIds(this.getCurrentScenario()));
    }

    return ids;
  }

  collectDirectApIds(entity) {
    const ids = new Set();
    if (!entity) return ids;

    this.extractApIdsInto(ids, entity.apId);
    this.extractApIdsInto(ids, entity.apIds);
    this.extractApIdsInto(ids, entity.apMapping);
    this.extractApIdsInto(ids, entity.apMappings);

    return ids;
  }

  extractApIdsInto(target, value) {
    if (!value) return target;

    if (Array.isArray(value)) {
      value.forEach((entry) => this.extractApIdsInto(target, entry));
      return target;
    }

    const matches = String(value).match(/\d+\.\d+/g) || [];
    matches.forEach((match) => target.add(match));
    return target;
  }

  mergeApIds(target, source) {
    (source || []).forEach((item) => target.add(item));
    return target;
  }

  getEdgesForEntityId(entityId) {
    if (!entityId) return [];
    const relatedIds = new Set([entityId]);
    const entity = this.getEntityById(entityId);

    if (entity?.parentNodeId) {
      relatedIds.add(entity.parentNodeId);
    } else {
      (this.data.embeddedNodes || []).forEach((item) => {
        if (item.parentNodeId === entityId) {
          relatedIds.add(item.id);
        }
      });
    }

    return Array.from(this.edgesById.values()).filter(
      (edge) => relatedIds.has(edge.source) || relatedIds.has(edge.target)
    );
  }

  orderApIds(apIds) {
    const uniqueIds = Array.from(new Set(Array.from(apIds || [])));
    const preferredOrder = new Map((this.data.apMappingSummary || []).map((entry, index) => [entry.ap, index]));

    return uniqueIds.sort((left, right) => {
      const leftIndex = preferredOrder.get(left);
      const rightIndex = preferredOrder.get(right);

      if (leftIndex === undefined && rightIndex === undefined) return left.localeCompare(right, 'de');
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    });
  }

  selectNode(nodeId) {
    this.state.selectedType = 'node';
    this.state.selectedId = nodeId;
    this.render();
  }

  selectGroup(groupId) {
    this.state.selectedType = 'group';
    this.state.selectedId = groupId;
    this.render();
  }

  selectEmbedded(embeddedId) {
    this.state.selectedType = 'embedded';
    this.state.selectedId = embeddedId;
    this.render();
  }

  selectEdge(edgeId) {
    this.state.selectedType = 'edge';
    this.state.selectedId = edgeId;
    this.render();
  }

  getSelectedEntity() {
    if (!this.state.selectedType || !this.state.selectedId) return null;

    if (this.state.selectedType === 'group') {
      const group = this.getRenderedGroup(this.state.selectedId);
      return group ? { type: 'group', entity: group } : null;
    }

    if (this.state.selectedType === 'node') {
      const node = this.getEntityById(this.state.selectedId);
      return node ? { type: 'node', entity: node } : null;
    }

    if (this.state.selectedType === 'embedded') {
      const embedded = this.embeddedById.get(this.state.selectedId);
      return embedded ? { type: 'embedded', entity: embedded } : null;
    }

    const edge = this.edgesById.get(this.state.selectedId);
    return edge ? { type: 'edge', entity: edge } : null;
  }

  getEntityById(id) {
    return (
      this.nodesById.get(id) ||
      this.actorsById.get(id) ||
      this.serviceBadgesById.get(id) ||
      this.embeddedById.get(id) ||
      this.groupsById.get(id) ||
      null
    );
  }

  getRenderedNode(nodeId) {
    return this.currentModel?.nodes.find((node) => node.id === nodeId) || null;
  }

  getRenderedGroup(groupId) {
    return this.currentModel?.groups.find((group) => group.id === groupId) || this.groupsById.get(groupId) || null;
  }

  getGroupNodes(group) {
    if (!group?.nodeIds?.length) return [];
    const source = this.currentModel?.nodes?.length ? this.currentModel.nodes : this.getEnabledItems(this.data.nodes);
    const nodeById = new Map(source.map((node) => [node.id, node]));
    return group.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
  }

  getGroupEdges(group) {
    const nodeIds = new Set((group?.nodeIds || []).filter(Boolean));
    const edges = this.currentModel?.edges || Array.from(this.edgesById.values());
    return edges.filter(
      (edge) => edge.source === group.id || edge.target === group.id || nodeIds.has(edge.source) || nodeIds.has(edge.target)
    );
  }

  getNodeBounds(node) {
    const width = node.width || NODE_DIMENSIONS.width;
    let height = node.height || NODE_DIMENSIONS.height;
    if (node.visualType === 'actor') {
      const markerScale = Math.max(1, node.markerScale || 1);
      height = Math.max(height, Math.round(36 * markerScale + 34));
    }
    return {
      x: node.x,
      y: node.y,
      width,
      height,
      cx: node.x + width / 2,
      cy: node.y + height / 2,
    };
  }

  buildEdgeGeometry(source, target) {
    const dx = target.cx - source.cx;
    const dy = target.cy - source.cy;

    let sx;
    let sy;
    let tx;
    let ty;

    if (Math.abs(dx) > Math.abs(dy)) {
      sx = dx >= 0 ? source.x + source.width : source.x;
      sy = source.cy;
      tx = dx >= 0 ? target.x : target.x + target.width;
      ty = target.cy;
    } else {
      sx = source.cx;
      sy = dy >= 0 ? source.y + source.height : source.y;
      tx = target.cx;
      ty = dy >= 0 ? target.y : target.y + target.height;
    }

    const horizontalCurve = Math.max(58, Math.abs(tx - sx) * 0.32);
    const verticalCurve = Math.max(58, Math.abs(ty - sy) * 0.32);

    const c1x = Math.abs(dx) > Math.abs(dy) ? sx + (dx >= 0 ? horizontalCurve : -horizontalCurve) : sx;
    const c1y = Math.abs(dx) > Math.abs(dy) ? sy : sy + (dy >= 0 ? verticalCurve : -verticalCurve);
    const c2x = Math.abs(dx) > Math.abs(dy) ? tx - (dx >= 0 ? horizontalCurve : -horizontalCurve) : tx;
    const c2y = Math.abs(dx) > Math.abs(dy) ? ty : ty - (dy >= 0 ? verticalCurve : -verticalCurve);

    const path = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
    const midpoint = this.bezierPoint(0.5, { x: sx, y: sy }, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: tx, y: ty });

    return {
      path,
      labelX: midpoint.x,
      labelY: midpoint.y - 8,
    };
  }

  bezierPoint(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    return {
      x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
      y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
    };
  }

  renderMoodleShellNode(group, node, model) {
    const embeddedItems = model.embeddedByParent?.get(node.id) || [];
    const embeddedById = new Map(embeddedItems.map((item) => [item.id, item]));
    const embeddedLayout = this.getMoodleShellEmbeddedLayout(node);
    const padX = 16;
    const top = 16;

    const title = this.createSvgElement('text', {
      class: 'node-platform-title',
      x: padX,
      y: top + 8,
    });
    title.textContent = 'Moodle LMS (bestehend)';
    group.appendChild(title);

    const hasSecondaryLogo = Boolean(node.secondaryLogoSrc);
    const logoGap = hasSecondaryLogo ? 10 : 0;
    const availableLogoWidth = Math.min(206, node.bounds.width - padX * 2);
    const primaryAspectRatio = node.logoAspectRatio || 3.94;
    const secondaryAspectRatio = node.secondaryLogoAspectRatio || 4.11;
    let logoHeight = hasSecondaryLogo ? 26 : 54;
    let primaryLogoWidth = logoHeight * primaryAspectRatio;
    let secondaryLogoWidth = hasSecondaryLogo ? logoHeight * secondaryAspectRatio : 0;
    const totalLogoWidth = primaryLogoWidth + secondaryLogoWidth + logoGap;

    if (totalLogoWidth > availableLogoWidth) {
      const scale = availableLogoWidth / totalLogoWidth;
      logoHeight *= scale;
      primaryLogoWidth *= scale;
      secondaryLogoWidth *= scale;
    }

    const logoY = top + 24;
    const logosStartX =
      (node.bounds.width - (primaryLogoWidth + secondaryLogoWidth + logoGap)) / 2;

    if (hasSecondaryLogo) {
      group.appendChild(
        this.createSvgElement('image', {
          class: 'moodle-logo moodle-logo--secondary',
          x: logosStartX,
          y: logoY,
          width: secondaryLogoWidth,
          height: logoHeight,
          preserveAspectRatio: 'xMidYMid meet',
          href: node.secondaryLogoSrc,
        })
      );
    }

    const primaryLogoX = hasSecondaryLogo ? logosStartX + secondaryLogoWidth + logoGap : logosStartX;
    const logo = this.createSvgElement('image', {
      class: 'moodle-logo',
      x: primaryLogoX,
      y: logoY,
      width: primaryLogoWidth,
      height: logoHeight,
      preserveAspectRatio: 'xMidYMid meet',
      href: node.logoSrc || 'assets/moodle-logo.svg',
    });
    group.appendChild(logo);

    const ltiItem = embeddedById.get('embedded-ai-interface');
    const ltiFrame = embeddedLayout['embedded-ai-interface'];
    if (!ltiItem || !ltiFrame) {
      return;
    }

    const ltiGroup = this.createEmbeddedInteractiveGroup(
      ltiItem,
      'LTI Interface',
      'LTI-basierte Integrationsschicht fuer KI-Funktionen im Moodle-Kontext.'
    );
    ltiGroup.appendChild(
      this.createSvgElement('rect', {
        class: 'node-inner-lti',
        x: ltiFrame.x,
        y: ltiFrame.y,
        width: ltiFrame.width,
        height: ltiFrame.height,
        rx: 14,
        ry: 14,
      })
    );

    const ltiTitle = this.createSvgElement('text', {
      class: 'node-inner-title',
      x: ltiFrame.x + ltiFrame.width / 2,
      y: ltiFrame.y + 23,
    });
    ltiTitle.textContent = 'LTI Interface';
    ltiGroup.appendChild(ltiTitle);
    group.appendChild(ltiGroup);

    const badges = [
      { id: 'embedded-course-ui', label: 'Course UI', className: 'course' },
      { id: 'embedded-author-ui', label: 'Author UI', className: 'author' },
    ];

    badges.forEach((badge) => {
      const item = embeddedById.get(badge.id);
      const badgeFrame = embeddedLayout[badge.id];
      if (!item || !badgeFrame) {
        return;
      }
      const badgeGroup = this.createEmbeddedInteractiveGroup(
        item,
        badge.label,
        `${badge.label} im Moodle/LTI-Kontext.`
      );
      badgeGroup.appendChild(
        this.createSvgElement('rect', {
          class: `node-ui-badge ${badge.className}`,
          x: badgeFrame.x,
          y: badgeFrame.y,
          width: badgeFrame.width,
          height: badgeFrame.height,
          rx: 9,
          ry: 9,
        })
      );

      const badgeText = this.createSvgElement('text', {
        class: 'node-ui-badge-text',
        x: badgeFrame.x + badgeFrame.width / 2,
        y: badgeFrame.y + 19.2,
      });
      badgeText.textContent = badge.label;
      badgeGroup.appendChild(badgeText);
      group.appendChild(badgeGroup);
    });
  }

  getMoodleShellEmbeddedLayout(node) {
    const padX = 16;
    const top = 16;
    const hasSecondaryLogo = Boolean(node.secondaryLogoSrc);
    const logoGap = hasSecondaryLogo ? 10 : 0;
    const availableLogoWidth = Math.min(206, node.bounds.width - padX * 2);
    const primaryAspectRatio = node.logoAspectRatio || 3.94;
    const secondaryAspectRatio = node.secondaryLogoAspectRatio || 4.11;
    let logoHeight = hasSecondaryLogo ? 26 : 54;
    let primaryLogoWidth = logoHeight * primaryAspectRatio;
    let secondaryLogoWidth = hasSecondaryLogo ? logoHeight * secondaryAspectRatio : 0;
    const totalLogoWidth = primaryLogoWidth + secondaryLogoWidth + logoGap;

    if (totalLogoWidth > availableLogoWidth) {
      const scale = availableLogoWidth / totalLogoWidth;
      logoHeight *= scale;
      primaryLogoWidth *= scale;
      secondaryLogoWidth *= scale;
    }

    const logoY = top + 24;
    const ltiX = padX;
    const ltiY = logoY + logoHeight + 10;
    const ltiWidth = node.bounds.width - padX * 2;
    const ltiHeight = Math.max(120, node.bounds.height - ltiY - 16);
    const badgeInnerPad = 10;
    const badgeWidth = ltiWidth - badgeInnerPad * 2;
    const badgeHeight = 30;
    const badgeGap = 8;
    const firstBadgeY = ltiY + 30;

    return {
      'embedded-ai-interface': {
        x: ltiX,
        y: ltiY,
        width: ltiWidth,
        height: ltiHeight,
      },
      'embedded-course-ui': {
        x: ltiX + badgeInnerPad,
        y: firstBadgeY,
        width: badgeWidth,
        height: badgeHeight,
      },
      'embedded-author-ui': {
        x: ltiX + badgeInnerPad,
        y: firstBadgeY + badgeHeight + badgeGap,
        width: badgeWidth,
        height: badgeHeight,
      },
    };
  }

  getEmbeddedBounds(item, parentNode) {
    if (!item || !parentNode) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        cx: 0,
        cy: 0,
      };
    }

    const localBounds = this.getMoodleShellEmbeddedLayout(parentNode)[item.id];
    if (!localBounds) {
      return {
        x: parentNode.bounds.x,
        y: parentNode.bounds.y,
        width: 0,
        height: 0,
        cx: parentNode.bounds.cx,
        cy: parentNode.bounds.cy,
      };
    }

    const x = parentNode.bounds.x + localBounds.x;
    const y = parentNode.bounds.y + localBounds.y;

    return {
      x,
      y,
      width: localBounds.width,
      height: localBounds.height,
      cx: x + localBounds.width / 2,
      cy: y + localBounds.height / 2,
    };
  }

  createEmbeddedInteractiveGroup(item, fallbackLabel, fallbackTooltip) {
    const hasEntity = Boolean(item?.id);
    const isSelected = hasEntity && this.state.selectedType === 'embedded' && this.state.selectedId === item.id;
    const wrapper = this.createSvgElement('g', {
      class: `embedded-item ${isSelected ? 'is-selected' : ''}`,
      'data-interactive': 'true',
    });

    if (!hasEntity) {
      return wrapper;
    }

    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute(
      'aria-label',
      `${item.label || fallbackLabel}, ${this.formatDataClass(item.dataClass || 'system')}`
    );

    const select = (event) => {
      event.stopPropagation();
      this.selectEmbedded(item.id);
    };

    wrapper.addEventListener('click', select);
    wrapper.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(event);
      }
    });

    const tooltipText = item.shortDescription || fallbackTooltip || fallbackLabel;
    wrapper.addEventListener('mouseenter', (event) => {
      this.showTooltip(tooltipText, event.clientX, event.clientY);
    });
    wrapper.addEventListener('mousemove', (event) => {
      this.moveTooltip(event.clientX, event.clientY);
    });
    wrapper.addEventListener('mouseleave', () => this.hideTooltip());
    wrapper.addEventListener('focus', () => this.showTooltipNearElement(tooltipText, wrapper));
    wrapper.addEventListener('blur', () => this.hideTooltip());

    return wrapper;
  }

  renderLogoNode(group, node) {
    const titleText = node.logoTitle || node.displayLabel || node.label;
    const showTitle = node.showLogoTitle !== false && Boolean(titleText);
    let contentTop = 10;

    if (showTitle) {
      const title = this.createSvgElement('text', {
        class: 'node-title',
        x: node.bounds.width / 2,
        y: 24,
        'text-anchor': 'middle',
      });
      title.textContent = titleText;
      group.appendChild(title);
      contentTop = 30;
    }

    const maxWidth = node.bounds.width - 20;
    const maxHeight = Math.max(20, node.bounds.height - contentTop - 10);
    const logoWidth = Math.min(node.logoWidth || 120, maxWidth);
    const logoHeight = Math.min(node.logoHeight || 26, maxHeight);
    const x = (node.bounds.width - logoWidth) / 2;
    const y = contentTop + Math.max(0, (maxHeight - logoHeight) / 2);

    group.appendChild(
      this.createSvgElement('image', {
        class: 'node-provider-logo',
        x,
        y,
        width: logoWidth,
        height: logoHeight,
        preserveAspectRatio: 'xMidYMid meet',
        href: node.logoSrc,
      })
    );

    if (node.logoTag) {
      const tag = this.createSvgElement('text', {
        class: 'node-logo-tag',
        x: Math.min(node.bounds.width - 8, x + logoWidth + 4),
        y: y + logoHeight - 2,
      });
      tag.textContent = node.logoTag;
      group.appendChild(tag);
    }
  }

  wrapNodeLabel(label, maxCharsPerLine) {
    if (!label || label.length <= maxCharsPerLine) return [label || ''];

    const words = label.split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine || lines.length === 1) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    if (lines.length > 2) {
      const first = lines[0];
      const second = `${lines.slice(1).join(' ').slice(0, maxCharsPerLine - 1)}...`;
      return [first, second];
    }

    return lines;
  }

  wrapGroupLabel(label, maxCharsPerLine) {
    if (label.length <= maxCharsPerLine) return [label];

    const words = label.split(' ');
    const lines = [];
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine || lines.length >= 2) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  getZoneTitle(zoneId) {
    const zone = (this.data.zones || []).find((item) => item.id === zoneId);
    return zone ? zone.title : zoneId;
  }

  getEntityLabel(id) {
    return this.getEntityById(id)?.label || id;
  }

  dataBadge(dataClass) {
    return `<span class="data-badge ${dataClass}">${this.escapeHtml(this.formatDataClass(dataClass))}</span>`;
  }

  formatDataClass(dataClass) {
    switch (dataClass) {
      case 'pii':
        return 'PII';
      case 'non-pii':
        return 'non-PII';
      case 'mixed':
        return 'mixed';
      case 'system':
        return 'system';
      default:
        return dataClass;
    }
  }

  isExternalEdge(edge) {
    const source = this.getEntityById(edge.source);
    const target = this.getEntityById(edge.target);
    const externalZones = new Set(['eu-cloud', 'us-global']);
    return externalZones.has(source?.zone) || externalZones.has(target?.zone);
  }

  renderList(items) {
    if (!items || !items.length) return '<p>Keine Angaben.</p>';
    return `<ul>${items.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  renderEntityReferenceList(items, { emptyText = 'Keine Angaben.', buttonLabel = 'Oeffnen', attributeName = 'data-select-node' } = {}) {
    if (!items || !items.length) return `<p>${this.escapeHtml(emptyText)}</p>`;

    return `
      <ul class="flow-list">
        ${items
          .map(
            (item) => `
          <li class="flow-item">
            <div class="flow-main">
              <span>${this.escapeHtml(item.label)}</span>
              ${item.dataClass ? this.dataBadge(item.dataClass) : ''}
            </div>
            <div class="flow-route">${this.escapeHtml(item.shortDescription || this.getZoneTitle(item.zone) || '')}</div>
            <button type="button" class="flow-select" ${attributeName}="${item.id}">${this.escapeHtml(buttonLabel)}</button>
          </li>
        `
          )
          .join('')}
      </ul>
    `;
  }

  renderEdgeReferenceSection(title, edges, emptyText) {
    if (!edges.length) {
      return `
        <section class="section">
          <h3>${title}</h3>
          <p>${this.escapeHtml(emptyText)}</p>
        </section>
      `;
    }

    return `
      <section class="section">
        <h3>${title}</h3>
        <ul class="flow-list">
          ${edges
            .map(
              (edge) => `
            <li class="flow-item">
              <div class="flow-main">
                <span>${this.escapeHtml(edge.label)}</span>
                ${this.dataBadge(edge.dataClass)}
              </div>
              <div class="flow-route">${this.escapeHtml(this.getEntityLabel(edge.source))} -> ${this.escapeHtml(this.getEntityLabel(edge.target))}</div>
              <button type="button" class="flow-select" data-select-edge="${edge.id}">Pfad oeffnen</button>
            </li>
          `
            )
            .join('')}
        </ul>
      </section>
    `;
  }

  clientToSvgPoint(clientX, clientY) {
    const rect = this.elements.svg.getBoundingClientRect();
    const viewBox = this.elements.svg.viewBox.baseVal;

    const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width;
    const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height;
    return { x, y };
  }

  showTooltip(text, clientX, clientY) {
    if (!text) return;
    this.elements.tooltip.textContent = text;
    this.elements.tooltip.classList.add('is-visible');
    this.elements.tooltip.setAttribute('aria-hidden', 'false');
    this.moveTooltip(clientX, clientY);
  }

  showTooltipNearElement(text, element) {
    const rect = element.getBoundingClientRect();
    this.showTooltip(text, rect.left + rect.width / 2, rect.top + 6);
  }

  moveTooltip(clientX, clientY) {
    const parentRect = this.elements.svgWrap.getBoundingClientRect();
    const tooltipRect = this.elements.tooltip.getBoundingClientRect();

    let left = clientX - parentRect.left + 14;
    let top = clientY - parentRect.top + 14;

    if (left + tooltipRect.width > parentRect.width - 12) {
      left = parentRect.width - tooltipRect.width - 12;
    }

    if (top + tooltipRect.height > parentRect.height - 12) {
      top = parentRect.height - tooltipRect.height - 12;
    }

    if (left < 8) left = 8;
    if (top < 8) top = 8;

    this.elements.tooltip.style.left = `${left}px`;
    this.elements.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.elements.tooltip.classList.remove('is-visible');
    this.elements.tooltip.setAttribute('aria-hidden', 'true');
  }

  clearLayer(layer) {
    layer.textContent = '';
  }

  createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArchitectureDashboard(ARCHITECTURE_DATA);
});
