import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { saveCredentials } from './credentials.js';
import { QUERIES } from '../queries.js';

interface LoginResult {
  authToken: string;
  userId: string;
  email: string;
  organizations: Array<{ id: string; name: string }>;
}

export async function loginWithCredentials(
  apiUrl: string,
  email: string,
  password: string
): Promise<LoginResult> {
  const response = await fetch(`${apiUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extensions: { persistedQuery: { sha256Hash: QUERIES.login } },
      query: '',
      variables: { input: { email, password } },
    }),
  });

  const result = await response.json() as {
    data?: {
      login: {
        authToken: string;
        user: {
          id: string;
          email: string;
          name: string;
          organizations: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  if (!result.data?.login) {
    throw new Error('Login failed: no data returned');
  }

  const { authToken, user } = result.data.login;

  return {
    authToken,
    userId: user.id,
    email: user.email,
    organizations: user.organizations.edges.map((e) => e.node),
  };
}

export async function runLoginCli() {
  const apiUrl = process.env.VIZCOM_API_URL ?? 'https://app.vizcom.com/api/v1';
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const email = await rl.question('Email: ');
    const password = await rl.question('Password: ');

    const result = await loginWithCredentials(apiUrl, email, password);

    if (result.organizations.length === 0) {
      console.error('No organizations found for this account.');
      process.exit(1);
    }

    let organizationId: string;
    if (result.organizations.length === 1) {
      organizationId = result.organizations[0].id;
      console.log(`Organization: ${result.organizations[0].name}`);
    } else {
      console.log('\nSelect an organization:');
      result.organizations.forEach((org, i) => {
        console.log(`  ${i + 1}. ${org.name}`);
      });
      const choice = await rl.question(`Enter a number (1-${result.organizations.length}): `);
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= result.organizations.length) {
        console.error('Invalid choice.');
        process.exit(1);
      }
      organizationId = result.organizations[idx].id;
    }

    saveCredentials({
      apiUrl,
      authToken: result.authToken,
      organizationId,
      userId: result.userId,
      email: result.email,
    });

    console.log(`\n✓ Logged in as ${result.email}`);
    console.log('Credentials saved to ~/.vizcom/credentials.json');
  } catch (error) {
    rl.close();
    if (error instanceof Error && error.message.includes('password')) {
      process.stderr.write(`\n✗ ${error.message}\n`);
      process.stderr.write('\nIf you signed up with Google/SSO, set a password first:\n');
      process.stderr.write('  1. Go to https://app.vizcom.com/forgot-password\n');
      process.stderr.write('  2. Enter your email to receive a reset link\n');
      process.stderr.write('  3. Set a password, then run this command again\n');
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`\nLogin failed: ${msg}\n`);
    }
    process.exitCode = 1;
    return;
  }
  rl.close();
}

// Run when invoked directly (not via import from index.ts)
const isDirectRun = process.argv[1]?.endsWith('/auth/login.js');
if (isDirectRun) {
  runLoginCli();
}
