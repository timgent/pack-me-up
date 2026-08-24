/**
 * The app's Application Capability description, served at "/" via content
 * negotiation instead of the SPA when a client asks for `application/ld+json`
 * or `text/turtle` (see /middleware.ts and ./negotiate.ts), and restated as
 * RDFa in the footer (src/components/ApplicationCapabilityRdfa.tsx).
 *
 * The spec is Application Capability, Draft Community Group Report 17 August
 * 2026 (https://dokieli.github.io/application-capability/). It describes an app
 * as: what it can do (Capabilities), how another agent triggers those actions
 * (Invocations, as RFC 6570 URI Templates resolved against the app's own
 * deployment IRI), and what it needs from its environment (Requirements: CSP
 * directives and browser permissions, each annotated with a DPV purpose).
 *
 * Everything here is checked against something real:
 *
 * - Every term comes from the spec's own JSON-LD context (§2.3), and every
 *   value from a vocabulary the spec's examples use. `odrl:display` is the
 *   action its open/view examples use; `dpv:ServiceProvision` is the purpose
 *   its Requirement examples use; `clipboard-write` is a Permissions API name.
 *   The one term the spec doesn't supply is a "create" action — ODRL 2.2 has no
 *   such action — so the two creation capabilities use `as:Create` from the
 *   Activity Vocabulary, whose prefix the spec's context already binds.
 * - Every invocation template resolves to a route that exists. `#open={open}`
 *   is handled by ./openInvocation.ts and src/pages/open-resource.tsx;
 *   `#/create-packing-list` and `#/wizard` are routes in src/App.tsx.
 * - The vocabulary (`pmu:`) and the SHACL shapes are cross-checked against
 *   src/services/rdfVocab.ts and src/services/rdfSerialization.ts, so a shape
 *   describes what the app actually writes to a pod.
 *
 * Two representations are hand-maintained here — JSON-LD (the spec's preferred
 * format) and Turtle — and MUST describe the same triples. `document.test.ts`
 * parses both and compares the canonicalised quads, so they cannot drift.
 *
 * Nothing here hardcodes where the app is deployed: every IRI is built from the
 * origin the request arrived on, so a Vercel preview describes itself and not
 * production.
 */

/** Trailing slashes off, so `${origin}/#i` is well-formed for any input. */
function normaliseOrigin(origin: string): string {
    return origin.replace(/\/+$/, '')
}

export interface CapabilityNode {
    id: string
    type: string
    action: string
    output: string
    resourceType: string
    shape?: string
    invocation: string
}

export interface InvocationNode {
    id: string
    type: string
    template: string
    mapping?: { variable: string; property: string }[]
}

export interface RequirementNode {
    id: string
    type: string
    cspDirective?: string
    browserPermission?: string
    hasPurpose: string
}

export interface ApplicationNode {
    id: string
    type: string
    'as:name': string
    capability: string[]
    requirement: string[]
}

export interface CapabilityDescription {
    application: ApplicationNode
    capabilities: CapabilityNode[]
    invocations: InvocationNode[]
    requirements: RequirementNode[]
    jsonld: Record<string, unknown>
    turtle: string
}

/**
 * Local context extension on top of https://www.w3.org/ns/ac.jsonld, which
 * defines every `ac:`/`hydra:`/`dpv:` term used below and marks them
 * `@protected`. Only the terms this document adds are declared here. SHACL
 * terms are added as their own compact-IRI keys (e.g. "sh:targetClass") rather
 * than bare aliases like "targetClass", so nothing here can collide with an
 * ac.jsonld term.
 */
const CONTEXT = [
    'https://www.w3.org/ns/ac.jsonld',
    {
        pmu: 'https://pack-me-up.app/vocab#',
        schema: 'https://schema.org/',
        dcterms: 'http://purl.org/dc/terms/',
        xsd: 'http://www.w3.org/2001/XMLSchema#',
        sh: 'http://www.w3.org/ns/shacl#',
        'sh:targetClass': { '@type': '@id' },
        'sh:path': { '@type': '@id' },
        'sh:class': { '@type': '@id' },
        'sh:datatype': { '@type': '@id' },
        'sh:nodeKind': { '@type': '@id' },
    },
]

export function capabilityDescription(rawOrigin: string): CapabilityDescription {
    const origin = normaliseOrigin(rawOrigin)

    // ── Invocations ──────────────────────────────────────────────────────────

    /**
     * The spec's canonical open invocation (§5.3.1): one query-form variable in
     * the fragment carrying the full IRI of the resource to open. The fragment
     * keeps that IRI client-side — it never reaches this app's host.
     *
     * Both "view" capabilities share this one invocation by reference, the way
     * the spec's own two-capabilities-one-invocation example does: the app
     * works out from the IRI itself whether it was handed a packing list or a
     * question set. src/capability/openInvocation.ts does that resolution.
     */
    const invokeOpen: InvocationNode = {
        id: `${origin}/#invoke-open`,
        type: 'UriTemplateInvocation',
        template: '#open={open}',
        mapping: [{ variable: 'open', property: 'ac:open' }],
    }

    const invokeCreatePackingList: InvocationNode = {
        id: `${origin}/#invoke-create-packing-list`,
        type: 'UriTemplateInvocation',
        template: '#/create-packing-list',
    }

    const invokeSetupWizard: InvocationNode = {
        id: `${origin}/#invoke-setup-wizard`,
        type: 'UriTemplateInvocation',
        template: '#/wizard',
    }

    // ── Capabilities ─────────────────────────────────────────────────────────

    /** Open a packing list by IRI — your own, or one shared from another pod. */
    const capabilityViewPackingList: CapabilityNode = {
        id: `${origin}/#capability-view-packing-list`,
        type: 'Capability',
        action: 'odrl:display',
        output: 'text/html',
        resourceType: 'pmu:PackingList',
        shape: `${origin}/#PackingListShape`,
        invocation: invokeOpen.id,
    }

    /** Open a question/items set by IRI — your own, or another pod's. */
    const capabilityViewQuestionSet: CapabilityNode = {
        id: `${origin}/#capability-view-question-set`,
        type: 'Capability',
        action: 'odrl:display',
        output: 'text/html',
        resourceType: 'pmu:QuestionSet',
        shape: `${origin}/#QuestionSetShape`,
        invocation: invokeOpen.id,
    }

    /**
     * Start the "create a new packing list" flow. There is no target resource
     * yet, so the invocation takes no variables — but the capability still
     * declares the type of resource it ends up producing.
     */
    const capabilityCreatePackingList: CapabilityNode = {
        id: `${origin}/#capability-create-packing-list`,
        type: 'Capability',
        action: 'as:Create',
        output: 'text/html',
        resourceType: 'pmu:PackingList',
        invocation: invokeCreatePackingList.id,
    }

    /** Run the guided setup wizard, which generates a starter QuestionSet. */
    const capabilitySetupWizard: CapabilityNode = {
        id: `${origin}/#capability-setup-wizard`,
        type: 'Capability',
        action: 'as:Create',
        output: 'text/html',
        resourceType: 'pmu:QuestionSet',
        invocation: invokeSetupWizard.id,
    }

    // ── Requirements ─────────────────────────────────────────────────────────

    const requirementScripts: RequirementNode = {
        id: `${origin}/#requirement-scripts`,
        type: 'Requirement',
        cspDirective: "script-src 'self'",
        hasPurpose: 'dpv:ServiceProvision',
    }

    /**
     * Solid pods are arbitrary, user-chosen HTTPS origins (any Community Solid
     * Server, Inrupt PodSpaces, or self-hosted pod a person points the app at),
     * so this can't be a fixed allowlist the way script-src can. Sentry error
     * reporting (src/sentry.ts) also needs an origin here, but it's covered by
     * the same https: wildcard so isn't called out separately.
     */
    const requirementConnect: RequirementNode = {
        id: `${origin}/#requirement-connect`,
        type: 'Requirement',
        cspDirective: "connect-src 'self' https:",
        hasPurpose: 'dpv:ServiceProvision',
    }

    /**
     * navigator.clipboard.writeText — copying a share link
     * (SharePackingListModal.tsx, sharing-settings.tsx), copying error details
     * (Toast.tsx) and copying the sign-in log (SignInHistory.tsx).
     */
    const requirementClipboard: RequirementNode = {
        id: `${origin}/#requirement-clipboard`,
        type: 'Requirement',
        browserPermission: 'clipboard-write',
        hasPurpose: 'dpv:ServiceProvision',
    }

    // ── Application ──────────────────────────────────────────────────────────

    const capabilities = [
        capabilityViewPackingList,
        capabilityViewQuestionSet,
        capabilityCreatePackingList,
        capabilitySetupWizard,
    ]

    const invocations = [invokeOpen, invokeCreatePackingList, invokeSetupWizard]

    const requirements = [requirementScripts, requirementConnect, requirementClipboard]

    const application: ApplicationNode = {
        id: `${origin}/#i`,
        type: 'ac:Application',
        'as:name': 'Pack Me Up',
        capability: capabilities.map(c => c.id),
        requirement: requirements.map(r => r.id),
    }

    // ── SHACL shapes ─────────────────────────────────────────────────────────
    //
    // Not exhaustive — each covers the predicates that define the type (present
    // on every instance, or structurally load-bearing), not every optional
    // field PMU_NS carries. Cross-checked against packingListToDataset /
    // questionSetToDataset in src/services/rdfSerialization.ts.

    const packingListShape = {
        id: `${origin}/#PackingListShape`,
        type: 'sh:NodeShape',
        'sh:targetClass': 'pmu:PackingList',
        'sh:property': [
            { 'sh:path': 'schema:name', 'sh:datatype': 'xsd:string', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'dcterms:created', 'sh:datatype': 'xsd:dateTime', 'sh:minCount': 1, 'sh:maxCount': 1 },
            { 'sh:path': 'dcterms:modified', 'sh:datatype': 'xsd:dateTime', 'sh:maxCount': 1 },
            { 'sh:path': 'pmu:destination', 'sh:datatype': 'xsd:string', 'sh:maxCount': 1 },
            // Stored as plain YYYY-MM-DD strings, not xsd:date, to avoid timezone drift.
            { 'sh:path': 'pmu:tripStartDate', 'sh:datatype': 'xsd:string', 'sh:maxCount': 1 },
            { 'sh:path': 'pmu:tripEndDate', 'sh:datatype': 'xsd:string', 'sh:maxCount': 1 },
            { 'sh:path': 'pmu:hasItem', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:PackingListItem' },
            { 'sh:path': 'pmu:hasDeletedItem', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:PackingListItem' },
            { 'sh:path': 'pmu:hasGuest', 'sh:nodeKind': 'sh:IRI' },
            { 'sh:path': 'pmu:selectedPersonId', 'sh:datatype': 'xsd:string' },
            { 'sh:path': 'pmu:hasAnswer', 'sh:nodeKind': 'sh:IRI' },
        ],
    }

    const questionSetShape = {
        id: `${origin}/#QuestionSetShape`,
        type: 'sh:NodeShape',
        'sh:targetClass': 'pmu:QuestionSet',
        'sh:property': [
            { 'sh:path': 'dcterms:modified', 'sh:datatype': 'xsd:dateTime', 'sh:maxCount': 1 },
            { 'sh:path': 'pmu:hasPerson', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:Person' },
            { 'sh:path': 'pmu:hasQuestion', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:Question' },
            { 'sh:path': 'pmu:hasAlwaysNeededItem', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:QuestionItem' },
            { 'sh:path': 'pmu:alwaysNeededEmptySection', 'sh:datatype': 'xsd:string' },
            { 'sh:path': 'pmu:hasSectionOrderEntry', 'sh:nodeKind': 'sh:IRI', 'sh:class': 'pmu:SectionOrderEntry' },
            { 'sh:path': 'pmu:templateVersion', 'sh:datatype': 'xsd:integer', 'sh:maxCount': 1 },
        ],
    }

    const jsonld = {
        '@context': CONTEXT,
        '@graph': [
            application,
            capabilityViewPackingList,
            capabilityViewQuestionSet,
            capabilityCreatePackingList,
            capabilitySetupWizard,
            invokeOpen,
            invokeCreatePackingList,
            invokeSetupWizard,
            requirementScripts,
            requirementConnect,
            requirementClipboard,
            packingListShape,
            questionSetShape,
        ],
    }

    // Hand-maintained Turtle of the exact same triples — see the module comment,
    // and document.test.ts, which is what actually holds the two together.
    const turtle = `@prefix ac: <https://www.w3.org/ns/ac#> .
@prefix as: <https://www.w3.org/ns/activitystreams#> .
@prefix hydra: <http://www.w3.org/ns/hydra/core#> .
@prefix odrl: <http://www.w3.org/ns/odrl/2/> .
@prefix dpv: <https://w3id.org/dpv#> .
@prefix pmu: <https://pack-me-up.app/vocab#> .
@prefix schema: <https://schema.org/> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

<${origin}/#i> a ac:Application ;
    as:name "Pack Me Up" ;
    ac:capability
        <${origin}/#capability-view-packing-list>,
        <${origin}/#capability-view-question-set>,
        <${origin}/#capability-create-packing-list>,
        <${origin}/#capability-setup-wizard> ;
    ac:requirement
        <${origin}/#requirement-scripts>,
        <${origin}/#requirement-connect>,
        <${origin}/#requirement-clipboard> .

# Open a packing list by IRI — your own, or one shared from another pod.
<${origin}/#capability-view-packing-list> a ac:Capability ;
    ac:action odrl:display ;
    ac:output "text/html" ;
    ac:resourceType pmu:PackingList ;
    ac:shape <${origin}/#PackingListShape> ;
    ac:invocation <${origin}/#invoke-open> .

# Open a question/items set by IRI — your own, or another pod's.
<${origin}/#capability-view-question-set> a ac:Capability ;
    ac:action odrl:display ;
    ac:output "text/html" ;
    ac:resourceType pmu:QuestionSet ;
    ac:shape <${origin}/#QuestionSetShape> ;
    ac:invocation <${origin}/#invoke-open> .

# Start the "create a new packing list" flow.
<${origin}/#capability-create-packing-list> a ac:Capability ;
    ac:action as:Create ;
    ac:output "text/html" ;
    ac:resourceType pmu:PackingList ;
    ac:invocation <${origin}/#invoke-create-packing-list> .

# Run the guided setup wizard, which generates a starter QuestionSet.
<${origin}/#capability-setup-wizard> a ac:Capability ;
    ac:action as:Create ;
    ac:output "text/html" ;
    ac:resourceType pmu:QuestionSet ;
    ac:invocation <${origin}/#invoke-setup-wizard> .

# Shared by both view capabilities: the app resolves the IRI it is handed.
<${origin}/#invoke-open> a ac:UriTemplateInvocation ;
    hydra:template "#open={open}" ;
    hydra:mapping [ hydra:variable "open" ; hydra:property ac:open ] .

<${origin}/#invoke-create-packing-list> a ac:UriTemplateInvocation ;
    hydra:template "#/create-packing-list" .

<${origin}/#invoke-setup-wizard> a ac:UriTemplateInvocation ;
    hydra:template "#/wizard" .

<${origin}/#requirement-scripts> a ac:Requirement ;
    ac:cspDirective "script-src 'self'" ;
    dpv:hasPurpose dpv:ServiceProvision .

# Solid pods are arbitrary, user-chosen HTTPS origins, so this can't be a
# fixed allowlist. Sentry error reporting is covered by the same https: wildcard.
<${origin}/#requirement-connect> a ac:Requirement ;
    ac:cspDirective "connect-src 'self' https:" ;
    dpv:hasPurpose dpv:ServiceProvision .

# navigator.clipboard.writeText — copying a share link, error details or the sign-in log.
<${origin}/#requirement-clipboard> a ac:Requirement ;
    ac:browserPermission "clipboard-write" ;
    dpv:hasPurpose dpv:ServiceProvision .

<${origin}/#PackingListShape> a sh:NodeShape ;
    sh:targetClass pmu:PackingList ;
    sh:property
        [ sh:path schema:name ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path dcterms:created ; sh:datatype xsd:dateTime ; sh:minCount 1 ; sh:maxCount 1 ],
        [ sh:path dcterms:modified ; sh:datatype xsd:dateTime ; sh:maxCount 1 ],
        [ sh:path pmu:destination ; sh:datatype xsd:string ; sh:maxCount 1 ],
        [ sh:path pmu:tripStartDate ; sh:datatype xsd:string ; sh:maxCount 1 ],
        [ sh:path pmu:tripEndDate ; sh:datatype xsd:string ; sh:maxCount 1 ],
        [ sh:path pmu:hasItem ; sh:nodeKind sh:IRI ; sh:class pmu:PackingListItem ],
        [ sh:path pmu:hasDeletedItem ; sh:nodeKind sh:IRI ; sh:class pmu:PackingListItem ],
        [ sh:path pmu:hasGuest ; sh:nodeKind sh:IRI ],
        [ sh:path pmu:selectedPersonId ; sh:datatype xsd:string ],
        [ sh:path pmu:hasAnswer ; sh:nodeKind sh:IRI ] .

<${origin}/#QuestionSetShape> a sh:NodeShape ;
    sh:targetClass pmu:QuestionSet ;
    sh:property
        [ sh:path dcterms:modified ; sh:datatype xsd:dateTime ; sh:maxCount 1 ],
        [ sh:path pmu:hasPerson ; sh:nodeKind sh:IRI ; sh:class pmu:Person ],
        [ sh:path pmu:hasQuestion ; sh:nodeKind sh:IRI ; sh:class pmu:Question ],
        [ sh:path pmu:hasAlwaysNeededItem ; sh:nodeKind sh:IRI ; sh:class pmu:QuestionItem ],
        [ sh:path pmu:alwaysNeededEmptySection ; sh:datatype xsd:string ],
        [ sh:path pmu:hasSectionOrderEntry ; sh:nodeKind sh:IRI ; sh:class pmu:SectionOrderEntry ],
        [ sh:path pmu:templateVersion ; sh:datatype xsd:integer ; sh:maxCount 1 ] .
`

    return { application, capabilities, invocations, requirements, jsonld, turtle }
}
