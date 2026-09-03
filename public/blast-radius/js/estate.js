/**
 * The demonstration estate: Solstice Retail Group.
 *
 * A fictional company with a real shape — an AWS production account, a data
 * account, a GitHub Actions deployment pipeline, an Entra tenant, a GCP
 * analytics project, and an LLM support agent that was shipped last quarter
 * because a competitor shipped one.
 *
 * Nothing here is a planted "gotcha". Every policy in this file is the kind a
 * competent engineer writes on a deadline: a `PassRole` without a
 * `PassedToService` condition, a secret-read grant scoped to `secret/*` because
 * scoping it per-secret meant another pull request, an OIDC trust policy
 * copied from a blog post with the subject claim left as a wildcard. Each is
 * defensible alone. The graph module is what discovers that together they form
 * a route from a customer support ticket to the cardholder data vault — and it
 * discovers it, rather than being told.
 *
 * @module blast-radius/estate
 */

const PROD = '210987654321';
const DATA = '345678901234';

/** Policy documents, keyed by id. @type {Record<string, import('./iam.js').Policy>} */
export const POLICIES = {
  'pol-admin': {
    id: 'pol-admin',
    name: 'ProductionAdministrator',
    kind: 'identity',
    statements: [{ sid: 'FullAccess', effect: 'Allow', actions: ['*'], resources: ['*'] }],
  },

  'pol-ci-deploy': {
    id: 'pol-ci-deploy',
    name: 'PipelineDeploy',
    kind: 'identity',
    statements: [
      {
        sid: 'DeployFunctions',
        effect: 'Allow',
        actions: ['lambda:CreateFunction', 'lambda:UpdateFunctionCode', 'lambda:InvokeFunction', 'ecs:UpdateService'],
        resources: ['*'],
      },
      {
        sid: 'PassExecutionRoles',
        effect: 'Allow',
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${PROD}:role/*`],
      },
      {
        sid: 'PublishArtifacts',
        effect: 'Allow',
        actions: ['s3:PutObject', 's3:GetObject'],
        resources: [`arn:aws:s3:::solstice-build-artifacts/*`],
      },
    ],
  },

  'pol-agent-tools': {
    id: 'pol-agent-tools',
    name: 'SupportAgentToolExecution',
    kind: 'identity',
    statements: [
      {
        sid: 'TicketWorkflow',
        effect: 'Allow',
        actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:us-east-1:${PROD}:table/support-tickets`],
      },
      {
        sid: 'IssueRefunds',
        effect: 'Allow',
        actions: ['lambda:InvokeFunction'],
        resources: [`arn:aws:lambda:us-east-1:${PROD}:function:refund-worker`],
      },
      {
        sid: 'ReadIntegrationSecrets',
        effect: 'Allow',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:us-east-1:${PROD}:secret/*`],
      },
      {
        sid: 'ReadKnowledgeBase',
        effect: 'Allow',
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::solstice-support-kb/*'],
      },
    ],
  },

  'pol-payments': {
    id: 'pol-payments',
    name: 'PaymentsServiceAccess',
    kind: 'identity',
    statements: [
      {
        sid: 'ReadVault',
        effect: 'Allow',
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: ['arn:aws:s3:::solstice-cardholder-vault/*', 'arn:aws:s3:::solstice-cardholder-vault'],
      },
      {
        sid: 'DecryptCardData',
        effect: 'Allow',
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [`arn:aws:kms:us-east-1:${PROD}:key/payments`],
      },
      {
        sid: 'QueryLedger',
        effect: 'Allow',
        actions: ['rds-data:ExecuteStatement'],
        resources: [`arn:aws:rds:us-east-1:${PROD}:cluster:payments-ledger`],
      },
    ],
  },

  'pol-etl': {
    id: 'pol-etl',
    name: 'AnalyticsETL',
    kind: 'identity',
    statements: [
      {
        sid: 'MoveData',
        effect: 'Allow',
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        resources: ['arn:aws:s3:::solstice-customer-pii/*', 'arn:aws:s3:::solstice-analytics-staging/*'],
      },
      {
        sid: 'RunJobs',
        effect: 'Allow',
        actions: ['glue:CreateDevEndpoint', 'glue:StartJobRun'],
        resources: ['*'],
      },
      {
        sid: 'PassJobRoles',
        effect: 'Allow',
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${DATA}:role/*`, `arn:aws:iam::${PROD}:role/data-*`],
      },
    ],
  },

  'pol-analyst': {
    id: 'pol-analyst',
    name: 'DataAnalystWorkbench',
    kind: 'identity',
    statements: [
      {
        sid: 'ReadStaging',
        effect: 'Allow',
        actions: ['s3:GetObject', 's3:ListBucket', 'athena:StartQueryExecution'],
        resources: ['arn:aws:s3:::solstice-analytics-staging/*', '*'],
      },
      {
        sid: 'FetchNotebookCreds',
        effect: 'Allow',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:us-east-1:${DATA}:secret/*`],
      },
      {
        sid: 'AssumeAnalyticsRoles',
        effect: 'Allow',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${DATA}:role/*`],
      },
    ],
  },

  'pol-audit': {
    id: 'pol-audit',
    name: 'SecurityReadOnly',
    kind: 'identity',
    statements: [
      {
        sid: 'Observe',
        effect: 'Allow',
        actions: ['iam:Get*', 'iam:List*', 'cloudtrail:LookupEvents', 's3:GetBucketPolicy', 'config:*'],
        resources: ['*'],
      },
    ],
  },

  'pol-platform': {
    id: 'pol-platform',
    name: 'PlatformEngineering',
    kind: 'identity',
    statements: [
      {
        sid: 'ManageIdentities',
        effect: 'Allow',
        actions: ['iam:PutRolePolicy', 'iam:AttachRolePolicy', 'iam:CreateRole', 'iam:UpdateAssumeRolePolicy'],
        resources: [`arn:aws:iam::${PROD}:role/*`],
      },
      {
        sid: 'OperateFleet',
        effect: 'Allow',
        actions: ['ssm:SendCommand', 'ec2:Describe*'],
        resources: ['*'],
      },
    ],
  },

  'pol-boundary-standard': {
    id: 'pol-boundary-standard',
    name: 'StandardBoundary',
    kind: 'boundary',
    statements: [
      {
        sid: 'BoundedServices',
        effect: 'Allow',
        actions: ['s3:*', 'dynamodb:*', 'lambda:*', 'athena:*', 'glue:*', 'sts:AssumeRole', 'secretsmanager:GetSecretValue', 'kms:Decrypt', 'rds-data:*'],
        resources: ['*'],
      },
      {
        sid: 'NoIdentityWrites',
        effect: 'Deny',
        actions: ['iam:*Policy*', 'iam:UpdateAssumeRolePolicy', 'iam:CreateUser', 'iam:CreateAccessKey'],
        resources: ['*'],
      },
    ],
  },

  'trust-ci-deploy': {
    id: 'trust-ci-deploy',
    name: 'PipelineDeployTrust',
    kind: 'trust',
    statements: [
      {
        sid: 'GitHubOIDC',
        effect: 'Allow',
        actions: ['sts:AssumeRoleWithWebIdentity', 'sts:AssumeRole'],
        resources: ['*'],
        principals: ['arn:aws:iam::*:oidc-provider/token.actions.githubusercontent.com', 'arn:aws:iam::*:federated/github-actions'],
        conditions: [
          { operator: 'StringEquals', key: 'token.actions.githubusercontent.com:aud', values: ['sts.amazonaws.com'] },
          { operator: 'StringLike', key: 'token.actions.githubusercontent.com:sub', values: ['repo:solstice-retail/*'] },
        ],
      },
    ],
  },

  'trust-prod-admin': {
    id: 'trust-prod-admin',
    name: 'ProductionAdminTrust',
    kind: 'trust',
    statements: [
      {
        sid: 'BreakGlassHumans',
        effect: 'Allow',
        actions: ['sts:AssumeRole'],
        resources: ['*'],
        principals: [`arn:aws:iam::${PROD}:role/platform-engineering`],
        conditions: [{ operator: 'Bool', key: 'aws:MultiFactorAuthPresent', values: ['true'] }],
      },
    ],
  },

  'trust-agent-tools': {
    id: 'trust-agent-tools',
    name: 'SupportAgentToolTrust',
    kind: 'trust',
    statements: [
      {
        sid: 'AgentRuntime',
        effect: 'Allow',
        actions: ['sts:AssumeRole'],
        resources: ['*'],
        principals: [`arn:aws:iam::${PROD}:agent/support-copilot`, 'arn:aws:iam::*:service/bedrock-agent'],
      },
    ],
  },

  'trust-payments': {
    id: 'trust-payments',
    name: 'PaymentsServiceTrust',
    kind: 'trust',
    statements: [
      {
        sid: 'CheckoutWorkloads',
        effect: 'Allow',
        actions: ['sts:AssumeRole'],
        resources: ['*'],
        principals: [`arn:aws:iam::${PROD}:role/checkout-workload`],
      },
    ],
  },

  'trust-data-etl': {
    id: 'trust-data-etl',
    name: 'AnalyticsETLTrust',
    kind: 'trust',
    statements: [
      {
        sid: 'AnalystsAndJobs',
        effect: 'Allow',
        actions: ['sts:AssumeRole'],
        resources: ['*'],
        principals: [`arn:aws:iam::${DATA}:user/*`, `arn:aws:iam::${DATA}:role/*`],
      },
    ],
  },

  'res-vault-policy': {
    id: 'res-vault-policy',
    name: 'CardholderVaultBucketPolicy',
    kind: 'resource',
    statements: [
      {
        sid: 'DenyUnencryptedTransport',
        effect: 'Deny',
        actions: ['s3:*'],
        resources: ['arn:aws:s3:::solstice-cardholder-vault/*'],
        conditions: [{ operator: 'Bool', key: 'aws:SecureTransport', values: ['false'] }],
      },
      {
        sid: 'PaymentsOnly',
        effect: 'Allow',
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: ['arn:aws:s3:::solstice-cardholder-vault/*', 'arn:aws:s3:::solstice-cardholder-vault'],
        principals: [`arn:aws:iam::${PROD}:role/payments-service`],
      },
    ],
  },

  'scp-baseline': {
    id: 'scp-baseline',
    name: 'OrganizationBaseline',
    kind: 'scp',
    statements: [
      { sid: 'AllowServices', effect: 'Allow', actions: ['*'], resources: ['*'] },
      {
        sid: 'ProtectAuditTrail',
        effect: 'Deny',
        actions: ['cloudtrail:StopLogging', 'cloudtrail:DeleteTrail', 'config:DeleteConfigurationRecorder'],
        resources: ['*'],
      },
      {
        sid: 'RegionLock',
        effect: 'Deny',
        actions: ['ec2:RunInstances', 'rds:CreateDBInstance'],
        resources: ['*'],
        conditions: [{ operator: 'StringNotEquals', key: 'aws:RequestedRegion', values: ['us-east-1', 'eu-west-1'] }],
      },
    ],
  },
};

/**
 * The estate itself.
 *
 * @type {object}
 */
export const ESTATE = {
  id: 'solstice',
  name: 'Solstice Retail Group',
  summary: 'Two AWS accounts, one Entra tenant, one GCP analytics project, and a customer-facing support agent shipped in Q1.',
  accounts: [
    { id: PROD, name: 'solstice-production', cloud: 'aws', tier: 'production' },
    { id: DATA, name: 'solstice-analytics', cloud: 'aws', tier: 'non-production' },
    { id: 'contoso-tenant', name: 'Entra tenant', cloud: 'entra', tier: 'corporate' },
    { id: 'gcp-insights', name: 'gcp-insights', cloud: 'gcp', tier: 'non-production' },
  ],
  policies: POLICIES,
  scps: [{ policy: 'scp-baseline' }],

  principals: [
    {
      id: 'fed-github',
      name: 'GitHub Actions (solstice-retail org)',
      kind: 'federated',
      arn: `arn:aws:iam::${PROD}:federated/github-actions`,
      account: PROD,
      subjects: ['repo:solstice-retail/storefront:ref:refs/heads/main', 'repo:solstice-retail/storefront:pull_request'],
      claims: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': 'repo:solstice-retail/storefront:pull_request' },
      note: 'Every repository in the org can mint tokens for this provider, including forks that raise pull requests.',
    },
    {
      id: 'role-ci-deploy',
      name: 'pipeline-deploy',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/pipeline-deploy`,
      account: PROD,
      policies: ['pol-ci-deploy'],
      trust: 'trust-ci-deploy',
    },
    {
      id: 'role-prod-admin',
      name: 'production-admin',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/production-admin`,
      account: PROD,
      policies: ['pol-admin'],
      trust: 'trust-prod-admin',
    },
    {
      id: 'role-platform',
      name: 'platform-engineering',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/platform-engineering`,
      account: PROD,
      policies: ['pol-platform'],
      mfa: true,
    },
    {
      id: 'agent-support',
      name: 'support-copilot (LLM agent)',
      kind: 'agent',
      arn: `arn:aws:iam::${PROD}:agent/support-copilot`,
      account: PROD,
      policies: [],
      note: 'Reads customer tickets, email and the knowledge base — all attacker-writable text.',
    },
    {
      id: 'role-agent-tools',
      name: 'support-agent-tools',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/support-agent-tools`,
      account: PROD,
      policies: ['pol-agent-tools'],
      trust: 'trust-agent-tools',
    },
    {
      id: 'role-payments',
      name: 'payments-service',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/payments-service`,
      account: PROD,
      policies: ['pol-payments'],
      trust: 'trust-payments',
    },
    {
      id: 'role-checkout',
      name: 'checkout-workload',
      kind: 'workload',
      arn: `arn:aws:iam::${PROD}:role/checkout-workload`,
      account: PROD,
      policies: [],
    },
    {
      id: 'role-data-etl',
      name: 'data-etl',
      kind: 'role',
      arn: `arn:aws:iam::${DATA}:role/data-etl`,
      account: DATA,
      policies: ['pol-etl'],
      trust: 'trust-data-etl',
    },
    {
      id: 'user-analyst',
      name: 'jo.okafor (analyst)',
      kind: 'human',
      arn: `arn:aws:iam::${DATA}:user/jo.okafor`,
      account: DATA,
      policies: ['pol-analyst'],
      mfa: false,
    },
    {
      id: 'role-audit',
      name: 'security-readonly',
      kind: 'role',
      arn: `arn:aws:iam::${PROD}:role/security-readonly`,
      account: PROD,
      policies: ['pol-audit'],
      mfa: true,
    },
  ],

  agentTools: [
    { agent: 'agent-support', name: 'lookup_order', executesAs: 'role-agent-tools', humanApproval: false, writes: false },
    { agent: 'agent-support', name: 'issue_refund', executesAs: 'role-agent-tools', humanApproval: false, writes: true },
    { agent: 'agent-support', name: 'search_knowledge_base', executesAs: 'role-agent-tools', humanApproval: false, writes: false },
  ],

  secrets: [
    {
      id: 'secret-payments',
      name: 'payments-service-signing-key',
      arn: `arn:aws:secretsmanager:us-east-1:${PROD}:secret/payments-service-key`,
      account: PROD,
      holds: 'role-payments',
    },
    {
      id: 'secret-etl',
      name: 'analytics-loader-credentials',
      arn: `arn:aws:secretsmanager:us-east-1:${DATA}:secret/analytics-loader`,
      account: DATA,
      holds: 'role-data-etl',
    },
  ],

  compute: [
    {
      id: 'fn-refund',
      name: 'refund-worker',
      kind: 'lambda',
      arn: `arn:aws:lambda:us-east-1:${PROD}:function:refund-worker`,
      account: PROD,
      runsAs: 'role-payments',
    },
    {
      id: 'ec2-etl',
      name: 'etl-runner-01',
      kind: 'ec2',
      arn: `arn:aws:ec2:us-east-1:${DATA}:instance/i-0c9f2`,
      account: DATA,
      runsAs: 'role-data-etl',
    },
  ],

  resources: [
    {
      id: 'res-vault',
      name: 'Cardholder data vault',
      arn: 'arn:aws:s3:::solstice-cardholder-vault/*',
      account: PROD,
      kind: 's3',
      classification: 'crown',
      value: 41_000_000,
      records: 2_400_000,
      probes: ['s3:GetObject', 's3:ListBucket'],
      resourcePolicy: 'res-vault-policy',
      note: '2.4M stored card records under PCI DSS scope.',
    },
    {
      id: 'res-kms',
      name: 'Payments KMS key',
      arn: `arn:aws:kms:us-east-1:${PROD}:key/payments`,
      account: PROD,
      kind: 'kms',
      classification: 'crown',
      value: 41_000_000,
      probes: ['kms:Decrypt'],
      note: 'Without this key the vault objects are ciphertext.',
    },
    {
      id: 'res-ledger',
      name: 'Payments ledger cluster',
      arn: `arn:aws:rds:us-east-1:${PROD}:cluster:payments-ledger`,
      account: PROD,
      kind: 'rds',
      classification: 'crown',
      value: 18_000_000,
      probes: ['rds-data:ExecuteStatement'],
    },
    {
      id: 'res-pii',
      name: 'Customer PII lake',
      arn: 'arn:aws:s3:::solstice-customer-pii/*',
      account: DATA,
      kind: 's3',
      classification: 'sensitive',
      value: 9_500_000,
      records: 6_100_000,
      probes: ['s3:GetObject'],
    },
    {
      id: 'res-tickets',
      name: 'Support ticket store',
      arn: `arn:aws:dynamodb:us-east-1:${PROD}:table/support-tickets`,
      account: PROD,
      kind: 'dynamodb',
      classification: 'sensitive',
      value: 2_200_000,
      probes: ['dynamodb:Query', 'dynamodb:UpdateItem'],
    },
    {
      id: 'res-kb',
      name: 'Support knowledge base',
      arn: 'arn:aws:s3:::solstice-support-kb/*',
      account: PROD,
      kind: 's3',
      classification: 'internal',
      value: 250_000,
      probes: ['s3:GetObject'],
      note: 'Retrieval corpus for the agent. Anyone in support can edit an article.',
    },
    {
      id: 'res-staging',
      name: 'Analytics staging bucket',
      arn: 'arn:aws:s3:::solstice-analytics-staging/*',
      account: DATA,
      kind: 's3',
      classification: 'internal',
      value: 400_000,
      probes: ['s3:GetObject', 's3:PutObject'],
    },
  ],
};

/**
 * Controls the operator can switch on, each rewriting the estate.
 *
 * A control is not a checkbox on a spreadsheet: it is a transform of the
 * estate, of the agent architecture, or of both, and its worth is measured by
 * re-running the analysis afterwards and counting what disappeared.
 * `annualCost` feeds the risk-reduction-per-dollar ranking in
 * {@link module:blast-radius/fair}.
 *
 * Where two controls overlap — scoping the agent's secret grant and giving each
 * tool its own identity both remove the same hop — the risk model treats their
 * effects as multiplicative, which slightly overstates the pair. The ranking is
 * unaffected, and the alternative is a co-occurrence table nobody would
 * maintain honestly.
 *
 * @type {Array<{id: string, name: string, annualCost: number, effort: string,
 *   rationale: string, scope: string, apply?: (estate: object) => object,
 *   applySpec?: (spec: object) => object}>}
 */
export const CONTROLS = [
  {
    id: 'ctl-oidc-pin',
    name: 'Pin the OIDC subject claim',
    scope: 'identity',
    annualCost: 12_000,
    effort: 'One pull request per repository, plus a pipeline change.',
    rationale: 'A wildcard subject means every fork and pull-request build in the org holds production deployment rights.',
    apply(estate) {
      return rewritePolicy(estate, 'trust-ci-deploy', (policy) => ({
        ...policy,
        statements: policy.statements.map((statement) => ({
          ...statement,
          conditions: (statement.conditions ?? []).map((condition) => (condition.key.endsWith(':sub')
            ? { ...condition, operator: 'StringEquals', values: ['repo:solstice-retail/storefront:ref:refs/heads/main'] }
            : condition)),
        })),
      }));
    },
  },
  {
    id: 'ctl-agent-secret-scope',
    name: 'Scope the agent’s secret access to its own secret',
    scope: 'identity',
    annualCost: 4_000,
    effort: 'Rewrite one statement; no application change.',
    rationale: 'The support agent needs one integration secret. It was granted the whole namespace, which includes the payments signing key.',
    apply(estate) {
      return rewritePolicy(estate, 'pol-agent-tools', (policy) => ({
        ...policy,
        statements: policy.statements.map((statement) => (statement.sid === 'ReadIntegrationSecrets'
          ? { ...statement, resources: [`arn:aws:secretsmanager:us-east-1:${PROD}:secret/support-zendesk`] }
          : statement)),
      }));
    },
  },
  {
    id: 'ctl-passrole-constraint',
    name: 'Constrain iam:PassRole',
    scope: 'identity',
    annualCost: 18_000,
    effort: 'Add a condition and a role-path convention; retire two roles that break.',
    rationale: 'PassRole over every role in the account turns deployment rights into administrative rights.',
    apply(estate) {
      return rewritePolicy(estate, 'pol-ci-deploy', (policy) => ({
        ...policy,
        statements: policy.statements.map((statement) => (statement.sid === 'PassExecutionRoles'
          ? {
            ...statement,
            resources: [`arn:aws:iam::${PROD}:role/app-*`],
            conditions: [{ operator: 'StringEquals', key: 'iam:PassedToService', values: ['lambda.amazonaws.com', 'ecs-tasks.amazonaws.com'] }],
          }
          : statement)),
      }));
    },
  },
  {
    id: 'ctl-boundary',
    name: 'Attach permissions boundaries outside the identity pipeline',
    scope: 'identity',
    annualCost: 55_000,
    effort: 'Boundary policy, migration of 40-odd principals, a quarter of pipeline work.',
    rationale: 'A boundary makes self-granting impossible even when a principal holds IAM write actions.',
    apply(estate) {
      return {
        ...estate,
        principals: estate.principals.map((principal) => (['role-platform', 'role-data-etl', 'user-analyst', 'role-ci-deploy'].includes(principal.id)
          ? { ...principal, boundary: 'pol-boundary-standard' }
          : principal)),
      };
    },
  },
  {
    id: 'ctl-tool-approval',
    name: 'Human approval on state-changing agent tools',
    scope: 'ai',
    annualCost: 90_000,
    effort: 'Approval queue, staffing in support hours, latency budget.',
    rationale: 'Injection becomes a nuisance rather than an incident when the money-moving tool needs a person.',
    apply(estate) {
      return {
        ...estate,
        agentTools: (estate.agentTools ?? []).map((tool) => (tool.writes ? { ...tool, humanApproval: true } : tool)),
      };
    },
    applySpec(spec) {
      return { ...spec, tools: spec.tools.map((tool) => (tool.writes ? { ...tool, approval: true } : tool)) };
    },
  },
  {
    id: 'ctl-scp-trust',
    name: 'Deny trust-policy edits outside the identity pipeline',
    scope: 'identity',
    annualCost: 8_000,
    effort: 'One organizational guardrail plus a break-glass exception path.',
    rationale: 'Rewriting a trust policy is a two-line route to any role in the account.',
    apply(estate) {
      return rewritePolicy(estate, 'scp-baseline', (policy) => ({
        ...policy,
        statements: [
          ...policy.statements,
          {
            sid: 'NoTrustRewrites',
            effect: 'Deny',
            actions: ['iam:UpdateAssumeRolePolicy'],
            resources: ['*'],
            conditions: [{ operator: 'StringNotEquals', key: 'aws:PrincipalArn', values: [`arn:aws:iam::${PROD}:role/identity-pipeline`] }],
          },
        ],
      }));
    },
  },
  {
    id: 'ctl-per-tool-identity',
    name: 'One identity per agent tool',
    scope: 'ai',
    annualCost: 45_000,
    effort: 'Three roles instead of one, a runtime change to select credentials per tool, and a slower path to adding the fourth tool.',
    rationale: 'The shared tool role is sized for the union of what every tool might need. Splitting it removes the escalation half of the injection chain and makes cloud audit events attributable to a tool.',
    apply(estate) {
      const tools = estate.agentTools ?? [];
      const scoped = {
        lookup_order: { actions: ['dynamodb:GetItem', 'dynamodb:Query'], resources: [`arn:aws:dynamodb:us-east-1:${PROD}:table/support-tickets`] },
        issue_refund: { actions: ['lambda:InvokeFunction'], resources: [`arn:aws:lambda:us-east-1:${PROD}:function:refund-worker`] },
        search_knowledge_base: { actions: ['s3:GetObject'], resources: ['arn:aws:s3:::solstice-support-kb/*'] },
      };
      const policies = { ...estate.policies };
      const principals = [...estate.principals];
      const rewritten = tools.map((tool) => {
        const grant = scoped[tool.name];
        if (!grant) return tool;
        const roleId = `role-tool-${tool.name.replace(/_/g, '-')}`;
        const policyId = `pol-${roleId}`;
        policies[policyId] = {
          id: policyId,
          name: `Tool:${tool.name}`,
          kind: 'identity',
          statements: [{ sid: 'OneJob', effect: 'Allow', actions: grant.actions, resources: grant.resources }],
        };
        principals.push({
          id: roleId,
          name: `tool/${tool.name}`,
          kind: 'role',
          arn: `arn:aws:iam::${PROD}:role/${roleId}`,
          account: PROD,
          policies: [policyId],
          trust: 'trust-agent-tools',
        });
        return { ...tool, executesAs: roleId };
      });
      return { ...estate, policies, principals, agentTools: rewritten };
    },
    applySpec(spec) {
      return {
        ...spec,
        identity: { ...spec.identity, perTool: true, note: 'Each tool holds its own role, scoped to the one resource it touches; the agent runtime holds no credential.' },
        tools: spec.tools.map((tool) => ({ ...tool, identity: `role-tool-${tool.name.replace(/_/g, '-')}` })),
      };
    },
  },
  {
    id: 'ctl-provenance',
    name: 'Provenance-tagged context and memory',
    scope: 'ai',
    annualCost: 60_000,
    effort: 'Retrieval layer must track origin per chunk; a sprint of migration and a change to how memory is written.',
    rationale: 'Kills the indirect-injection class rather than individual payloads: untrusted origins are passed as data and cannot instruct.',
    applySpec(spec) {
      return {
        ...spec,
        retrieval: { ...(spec.retrieval ?? {}), provenance: true },
        memory: { ...spec.memory, provenance: true, note: 'Memory entries keep their origin and are never re-injected as instructions.' },
      };
    },
  },
  {
    id: 'ctl-screening',
    name: 'Screen untrusted content on the way in',
    scope: 'ai',
    annualCost: 25_000,
    effort: 'Detector in the ingest path plus a review queue somebody has to staff.',
    rationale: 'A triage aid with published precision and recall, not a boundary. Buys detection time and gives the sequence rule its first stage.',
    applySpec(spec) {
      return { ...spec, guardrails: { ...spec.guardrails, inputScreening: true } };
    },
  },
  {
    id: 'ctl-egress',
    name: 'Egress allow-list, no auto-rendered remote content',
    scope: 'ai',
    annualCost: 30_000,
    effort: 'Output post-processing and a registry of permitted outbound hosts.',
    rationale: 'Removes the zero-click channel where rendering the answer is the exfiltration.',
    applySpec(spec) {
      return { ...spec, egress: { allowlist: true, rendersRemoteContent: false } };
    },
  },
];

/**
 * Return a copy of the estate with one policy document replaced.
 *
 * @param {object} estate Estate to transform.
 * @param {string} policyId Policy being rewritten.
 * @param {(policy: import('./iam.js').Policy) => import('./iam.js').Policy} transform
 *   Producer of the replacement document.
 * @returns {object} New estate; the original is untouched.
 */
export function rewritePolicy(estate, policyId, transform) {
  return {
    ...estate,
    policies: { ...estate.policies, [policyId]: transform(estate.policies[policyId]) },
  };
}

/**
 * Apply a set of controls to the estate.
 *
 * @param {object} estate Baseline estate.
 * @param {string[]} controlIds Controls to switch on.
 * @returns {object} Transformed estate.
 */
export function applyControls(estate, controlIds) {
  return CONTROLS.filter((control) => controlIds.includes(control.id) && control.apply)
    .reduce((current, control) => control.apply(current), estate);
}

/**
 * Apply the same control selection to an agent architecture specification.
 *
 * Controls are one list because they are one budget. Some of them rewrite cloud
 * policy, some rewrite the agent's design, and a couple do both — which is the
 * point the console is making about where AI security actually lives.
 *
 * @param {object} spec Baseline agent specification.
 * @param {string[]} controlIds Controls to switch on.
 * @returns {object} Transformed specification.
 */
export function applySpecControls(spec, controlIds) {
  return CONTROLS.filter((control) => controlIds.includes(control.id) && control.applySpec)
    .reduce((current, control) => control.applySpec(current), spec);
}
