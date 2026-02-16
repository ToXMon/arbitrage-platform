# Akash Network Setup Guide

This guide covers the complete setup process for deploying on Akash Network, including CLI installation, wallet creation, and configuration.

## Table of Contents

1. [Installing Akash CLI](#installing-akash-cli)
2. [Creating and Funding Wallet](#creating-and-funding-wallet)
3. [Getting AKT Tokens](#getting-akt-tokens)
4. [Environment Variables Configuration](#environment-variables-configuration)
5. [Key Management and Security](#key-management-and-security)
6. [CLI Command Reference](#cli-command-reference)

---

## Installing Akash CLI

The Akash CLI (`akash`) is the command-line interface for interacting with the Akash Network. Choose your operating system below.

### Linux

#### Option 1: Download Pre-built Binary (Recommended)

~~~bash
# Set the version (check https://github.com/akash-network/node/releases for latest)
export AKASH_VERSION="v0.36.0"

# Download the binary
curl -L "https://github.com/akash-network/node/releases/download/${AKASH_VERSION}/akash_${AKASH_VERSION}_linux_amd64.zip" -o akash.zip

# Unzip and install
unzip akash.zip
mv akash /usr/local/bin/
chmod +x /usr/local/bin/akash

# Verify installation
akash version
~~~

#### Option 2: Install via Snap

~~~bash
sudo snap install akash --classic
akash version
~~~

#### Option 3: Build from Source

~~~bash
# Install Go 1.21+ if not already installed
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

# Clone and build Akash
git clone https://github.com/akash-network/node.git
cd node
git checkout v0.36.0
make install

# Verify
akash version
~~~

### macOS

#### Option 1: Homebrew (Recommended)

~~~bash
brew install akash-network/akash/akash
akash version
~~~

#### Option 2: Download Pre-built Binary

~~~bash
export AKASH_VERSION="v0.36.0"
curl -L "https://github.com/akash-network/node/releases/download/${AKASH_VERSION}/akash_${AKASH_VERSION}_darwin_amd64.zip" -o akash.zip
unzip akash.zip
mv akash /usr/local/bin/
chmod +x /usr/local/bin/akash
akash version
~~~

#### Option 3: Build from Source (Apple Silicon)

~~~bash
# Install Go via Homebrew
brew install go

# Clone and build
git clone https://github.com/akash-network/node.git
cd node
git checkout v0.36.0
make install

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH=$PATH:$(go env GOPATH)/bin

akash version
~~~

### Windows

#### Option 1: Download Binary

~~~powershell
# Using PowerShell
$AKASH_VERSION = "v0.36.0"
Invoke-WebRequest -Uri "https://github.com/akash-network/node/releases/download/${AKASH_VERSION}/akash_${AKASH_VERSION}_windows_amd64.zip" -OutFile "akash.zip"
Expand-Archive -Path akash.zip -DestinationPath .

# Move to a directory in PATH or add to PATH
move akash.exe C:\Windows\

# Verify
akash version
~~~

#### Option 2: Using WSL (Windows Subsystem for Linux)

~~~bash
# Install WSL if not already installed
wsl --install

# Then follow Linux instructions inside WSL
~~~

### Verify Installation

After installation, verify the CLI is working:

~~~bash
# Check version
akash version

# Expected output: v0.36.0 or similar
~~~

---

## Creating and Funding Wallet

### Network Selection

Akash has multiple networks. For production deployments, use mainnet. For testing, use testnet.

~~~bash
# Mainnet (Production)
export AKASH_CHAIN_ID="akashnet-2"
export AKASH_NODE="https://akash-rpc.polkachu.com:26657"

# Testnet (Sandbox for testing)
export AKASH_CHAIN_ID="sandbox-1"
export AKASH_NODE="https://rpc.sandbox-01.aksh.pw:26657"
~~~

> **Important**: Always set these environment variables before running Akash commands.

### Create a New Wallet

~~~bash
# Create a new key/wallet
akash keys add default

# Output will include:
# - name: default
# - type: local
# - address: akash1... (your wallet address)
# - pubkey: akashpub1...
# - mnemonic: 24-word seed phrase (WRITE THIS DOWN SECURELY!)
~~~

**⚠️ SECURITY WARNING**: Write down your mnemonic phrase (24 words) and store it securely. This is the ONLY way to recover your wallet if you lose access. Never share this phrase with anyone!

### Recover Existing Wallet

If you have an existing mnemonic:

~~~bash
# Restore wallet from mnemonic
akash keys add default --recover
# Enter your 24-word mnemonic when prompted
~~~

### Check Wallet Balance

~~~bash
# View your wallet address
akash keys show default -a

# Check balance
akash query bank balances $(akash keys show default -a)

# Expected output:
# balances:
# - amount: "10000000"
#   denom: uakt
~~~

### Understanding AKT Denominations

- **1 AKT** = 1,000,000 **uakt** (micro-AKT)
- All CLI commands use uakt
- Minimum transaction amounts are in uakt

~~~bash
# Example: 5 AKT = 5,000,000 uakt
# Example: 0.5 AKT = 500,000 uakt
~~~

---

## Getting AKT Tokens

### For Mainnet (Production)

#### Centralized Exchanges

Purchase AKT from major exchanges:

| Exchange | Trading Pairs | URL |
|----------|---------------|-----|
| Coinbase | AKT/USD, AKT/USDT | https://www.coinbase.com |
| Kraken | AKT/USD, AKT/EUR | https://www.kraken.com |
| KuCoin | AKT/USDT | https://www.kucoin.com |
| Crypto.com | AKT/USD | https://crypto.com |
| Gate.io | AKT/USDT | https://www.gate.io |
| MEXC | AKT/USDT | https://www.mexc.com |

#### Decentralized Exchanges (DEX)

- **Osmosis**: AKT/OSMO, AKT/ATOM pairs
- **JunoSwap**: AKT/JUNO pairs
- **Sifchain**: AKT/ROWAN pairs

#### Transferring to Your Akash Wallet

~~~bash
# Get your wallet address
akash keys show default -a
# Output: akash1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Send AKT from exchange to this address
# Ensure you're sending on the Akash network (not IBC)
~~~

### For Testnet (Testing/Sandbox)

Testnet tokens are free and can be obtained from faucets:

~~~bash
# Get your testnet wallet address
akash keys show default -a

# Request tokens from faucet (choose one)

# Option 1: Discord Faucet
# Join Akash Discord: https://discord.gg/akash
# Go to #faucet channel
# Type: $request <your-address>

# Option 2: Web Faucet
# Visit: https://faucet.sandbox-01.aksh.pw/
# Enter your address and complete captcha

# Option 3: CLI Faucet (if available)
curl -X POST "https://faucet.sandbox-01.aksh.pw/faucet" \
  -H "Content-Type: application/json" \
  -d '{"address": "'$YOUR_ADDRESS'"}'

# Verify tokens received
akash query bank balances $(akash keys show default -a)
~~~

### Minimum AKT Requirements

For deploying the arbitrage platform:

| Component | Estimated AKT/Hour | Daily Cost |
|-----------|-------------------|------------|
| Frontend | ~0.001 AKT | ~0.024 AKT |
| API | ~0.0015 AKT | ~0.036 AKT |
| Bot Workers (4x) | ~0.004 AKT | ~0.096 AKT |
| PostgreSQL | ~0.0015 AKT | ~0.036 AKT |
| Redis | ~0.0005 AKT | ~0.012 AKT |
| **Total** | **~0.0085 AKT/hr** | **~0.2 AKT/day** |

**Recommendation**: Maintain at least 5-10 AKT in your wallet for:
- Deployment costs (escrow)
- Transaction fees
- Buffer for price fluctuations

---

## Environment Variables Configuration

### Essential Environment Variables

Create a configuration file or export these variables:

~~~bash
# Create akash-env.sh
cat > ~/akash-env.sh << 'EOF'
#!/bin/bash

# Network Configuration (Mainnet)
export AKASH_CHAIN_ID="akashnet-2"
export AKASH_NODE="https://akash-rpc.polkachu.com:26657"

# Alternative RPC endpoints (use one):
# export AKASH_NODE="https://rpc.akashnet.net:26657"
# export AKASH_NODE="https://akash-rpc.publicnode.com:26657"

# Keyring Configuration
export AKASH_KEYRING_BACKEND="os"  # or "file" for non-interactive use
export AKASH_KEY_NAME="default"

# Gas Configuration
export AKASH_GAS_PRICES="0.025uakt"
export AKASH_GAS_ADJUSTMENT="1.5"
export AKASH_GAS="auto"

# Output Format (optional)
export AKASH_OUTPUT_FORMAT="json"  # or "text"
EOF

# Source the configuration
source ~/akash-env.sh
~~~

### Load Configuration Automatically

~~~bash
# Add to ~/.bashrc or ~/.zshrc
echo "source ~/akash-env.sh" >> ~/.bashrc

# Reload shell
source ~/.bashrc
~~~

### Alternative RPC Endpoints

If the primary RPC is unavailable:

~~~bash
# Mainnet RPC endpoints
export AKASH_NODE="https://akash-rpc.polkachu.com:26657"
# export AKASH_NODE="https://rpc.akashnet.net:26657"
# export AKASH_NODE="https://akash-rpc.publicnode.com:26657"
# export AKASH_NODE="https://rpc.ankr.com/akash:26657"
# export AKASH_NODE="https://akash-rpc.validatornetwork.com:26657"
~~~

### Keyring Backend Options

| Backend | Security | Use Case |
|---------|----------|----------|
| `os` | High (OS-level encryption) | Desktop/workstation use |
| `file` | Medium (password-encrypted) | Servers, CI/CD pipelines |
| `test` | Low (plaintext) | Testing only, never for production |

For server deployments, use `file` backend:

~~~bash
export AKASH_KEYRING_BACKEND="file"

# You'll be prompted for password on each command
# Or use AKASH_KEYRING_PASSPHRASE for automation
~~~

---

## Key Management and Security

### Keyring Operations

~~~bash
# List all keys in keyring
akash keys list

# Show key details
akash keys show default

# Show only address
akash keys show default -a

# Export private key (encrypted)
akash keys export default --output json > key-backup.json

# Delete a key (DANGEROUS - ensure you have mnemonic!)
akash keys delete default
~~~

### Security Best Practices

#### 1. Mnemonic Storage

~~~bash
# Store mnemonic in encrypted file
echo "your 24 word mnemonic here" | gpg -c > mnemonic.gpg

# To recover later:
gpg -d mnemonic.gpg | akash keys add recovered --recover
~~~

#### 2. Hardware Wallet (Ledger)

~~~bash
# Connect Ledger device and open Cosmos app
# Create key from Ledger
akash keys add ledger --ledger

# Use Ledger key for transactions
akash tx send ledger <to-address> 1000000uakt --ledger
~~~

#### 3. Separate Wallets for Different Purposes

~~~bash
# Main funding wallet (cold storage)
akash keys add main-wallet

# Deployment wallet (hot wallet with limited funds)
akash keys add deploy-wallet

# Transfer funds as needed
akash tx bank send main-wallet $(akash keys show deploy-wallet -a) 5000000uakt
~~~

#### 4. Environment Security

~~~bash
# Never store mnemonics in shell history
# Use space before command to avoid history
d unset HISTFILE

# Or temporarily disable history
set +o history
# ... run sensitive commands ...
set -o history
~~~

#### 5. Keyring File Backend Setup (Server)

~~~bash
# Set up file-based keyring for servers
export AKASH_KEYRING_BACKEND="file"
export AKASH_HOME="~/.akash"

# Create directory with restricted permissions
mkdir -p ~/.akash
chmod 700 ~/.akash

# Add key (will prompt for passphrase)
akash keys add server-key
~~~

### Backup and Recovery

~~~bash
# Backup entire keyring
tar -czf keyring-backup-$(date +%Y%m%d).tar.gz ~/.akash/keyring*

# Encrypt backup
gpg -c keyring-backup-$(date +%Y%m%d).tar.gz

# Store encrypted backup securely (offline storage, cloud backup, etc.)
~~~

---

## CLI Command Reference

### Common Commands

#### Wallet Operations

~~~bash
# Show wallet
akash keys show default

# Check balance
akash q bank balances $(akash keys show default -a)

# Send tokens
akash tx bank send default <recipient-address> <amount>uakt

# Example: Send 1 AKT
akash tx bank send default akash1recipient... 1000000uakt
~~~

#### Query Commands

~~~bash
# Query account
akash query account $(akash keys show default -a)

# Query deployment
akash query deployment get --owner $(akash keys show default -a) --dseq <DSEQ>

# Query all deployments
akash query deployment list --owner $(akash keys show default -a)

# Query leases
akash query lease list --owner $(akash keys show default -a) --dseq <DSEQ>

# Query providers
akash query provider list

# Query specific provider
akash query provider get <provider-address>
~~~

#### Deployment Commands

~~~bash
# Create deployment
tx deployment create deploy.yaml --from default

# Update deployment
tx deployment update deploy.yaml --dseq <DSEQ> --from default

# Close deployment
tx deployment close --dseq <DSEQ> --from default

# Deposit more funds to deployment
tx deployment deposit <amount>uakt --dseq <DSEQ> --from default
~~~

#### Market Commands (Bidding)

~~~bash
# Query bids for deployment
akash query market bid list --owner $(akash keys show default -a) --dseq <DSEQ>

# Create lease (accept bid)
akash tx market lease create --owner $(akash keys show default -a) --dseq <DSEQ> --gseq 1 --oseq 1 --provider <provider-address> --from default

# Query active leases
akash query market lease list --owner $(akash keys show default -a) --state active
~~~

#### Service Commands

~~~bash
# Send manifest to provider
akash provider send-manifest deploy.yaml --dseq <DSEQ> --provider <provider-address> --from default

# Get service status
akash provider lease-status --dseq <DSEQ> --gseq 1 --oseq 1 --provider <provider-address> --from default

# View service logs
akash provider lease-logs --dseq <DSEQ> --gseq 1 --oseq 1 --provider <provider-address> --from default --service <service-name>

# SSH into service (if SSH enabled)
akash provider lease-shell --dseq <DSEQ> --gseq 1 --oseq 1 --provider <provider-address> --from default --service <service-name> -c "<command>"
~~~

### Command Flags Reference

| Flag | Description | Example |
|------|-------------|----------|
| `--from` | Key name to sign transaction | `--from default` |
| `--chain-id` | Network chain ID | `--chain-id akashnet-2` |
| `--node` | RPC node URL | `--node https://rpc.akashnet.net:26657` |
| `--gas` | Gas limit | `--gas auto` |
| `--gas-prices` | Gas price | `--gas-prices 0.025uakt` |
| `--gas-adjustment` | Gas adjustment factor | `--gas-adjustment 1.5` |
| `--yes` | Skip confirmation | `--yes` or `-y` |
| `--output` | Output format | `--output json` |
| `--dseq` | Deployment sequence | `--dseq 123456` |
| `--gseq` | Group sequence | `--gseq 1` |
| `--oseq` | Order sequence | `--oseq 1` |

### Useful Aliases

Add these to your shell configuration:

~~~bash
# Add to ~/.bashrc or ~/.zshrc
alias akash-balance='akash q bank balances $(akash keys show default -a)'
alias akash-address='akash keys show default -a'
alias akash-deployments='akash q deployment list --owner $(akash keys show default -a)'
alias akash-leases='akash q market lease list --owner $(akash keys show default -a) --state active'
~~~

---

## Troubleshooting

### Common Issues

#### "insufficient funds" Error

~~~bash
# Check balance
akash q bank balances $(akash keys show default -a)

# Add more AKT to wallet
~~~

#### "key not found" Error

~~~bash
# List available keys
akash keys list

# Check key name matches
export AKASH_KEY_NAME="default"  # or your key name
~~~

#### "incorrect chain-id" Error

~~~bash
# Verify chain ID
export AKASH_CHAIN_ID="akashnet-2"
echo $AKASH_CHAIN_ID
~~~

#### RPC Connection Issues

~~~bash
# Try alternative RPC
export AKASH_NODE="https://rpc.akashnet.net:26657"

# Test connection
curl -s $AKASH_NODE/status | jq .
~~~

#### Keyring Password Issues (file backend)

~~~bash
# Set passphrase via environment
export AKASH_KEYRING_PASSPHRASE="your-password"
~~~

---

## Next Steps

After completing setup:

1. **Proceed to [Deployment Guide](deploy-guide.md)** - Deploy your services
2. **Review [Monitoring Guide](monitoring.md)** - Monitor your deployment
3. **Check [Troubleshooting Guide](troubleshooting.md)** - Resolve common issues

---

## Additional Resources

- [Akash Official Documentation](https://docs.akash.network/)
- [Akash GitHub](https://github.com/akash-network)
- [Akash Discord Community](https://discord.gg/akash)
- [Akash Forum](https://forum.akash.network/)
- [Akash Status Page](https://status.akash.network/)
