"""
Emirald Stripe Backend
Handles: Product/Price creation, Checkout sessions, Webhooks, User auth, Download validation
"""
from __future__ import annotations

import os
import json
import hashlib
import hmac
import time
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from functools import wraps

from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file, flash
from flask_socketio import SocketIO, emit
import stripe
import requests
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Stripe configuration
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')

# App configuration
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', secrets.token_hex(32))
socketio = SocketIO(app, cors_allowed_origins="*")

# Database file (simple JSON for demo - use SQLite/PostgreSQL in production)
DB_FILE = Path(__file__).parent / 'data' / 'users.json'
DB_FILE.parent.mkdir(parents=True, exist_ok=True)

# Emirald download info
EMIRALD_DOWNLOAD_URL = os.getenv('EMIRALD_DOWNLOAD_URL', 'https://github.com/your-org/emirald/releases/latest/download/Emirald-Setup.exe')
EMIRALD_VERSION = '1.0.0'

# In-memory storage for simplicity
users_db = {}
pending_checkouts = {}

# Permanent free accounts
PERMANENT_FREE_ACCOUNTS = {
    'tails123@gmail.com': {
        'password_hash': hashlib.sha256(('blohunterdaddy1!' + 'emirald_salt').encode()).hexdigest(),
        'name': 'Tails',
        'is_permanent_free': True,
    },
    '1bananaonthewall@gmail.com': {
        'password_hash': hashlib.sha256(('Carterjaxon15!' + 'emirald_salt').encode()).hexdigest(),
        'name': 'Banana',
        'is_permanent_free': True,
    },
}

def load_users():
    global users_db
    if DB_FILE.exists():
        with open(DB_FILE, 'r') as f:
            users_db = json.load(f)
    # Merge permanent free accounts
    for email, data in PERMANENT_FREE_ACCOUNTS.items():
        if email not in users_db:
            users_db[email] = {
                'email': email,
                'name': data['name'],
                'password_hash': data['password_hash'],
                'created_at': datetime.utcnow().isoformat(),
                'stripe_customer_id': None,
                'subscription_status': 'active',
                'subscription_id': None,
                'downloads': 0,
                'last_download': None,
                'is_permanent_free': True,
            }

def save_users():
    with open(DB_FILE, 'w') as f:
        json.dump(users_db, f, indent=2)

load_users()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated

def get_current_user():
    if 'user_id' in session:
        return users_db.get(session['user_id'])
    return None

def verify_webhook_signature(payload, sig_header):
    try:
        stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        return True
    except (ValueError, stripe.error.SignatureVerificationError):
        return False

def create_or_get_stripe_customer(email, name=None):
    user = users_db.get(email)
    if user and user.get('stripe_customer_id'):
        try:
            customer = stripe.Customer.retrieve(user['stripe_customer_id'])
            return customer
        except stripe.error.InvalidRequestError:
            pass

    customer = stripe.Customer.create(
        email=email,
        name=name,
        metadata={'source': 'emirald_landing'}
    )

    if email in users_db:
        users_db[email]['stripe_customer_id'] = customer.id
        save_users()

    return customer

def create_checkout_session(customer_id, price_id, success_url, cancel_url, metadata=None):
    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=['card'],
        line_items=[{'price': price_id, 'quantity': 1}],
        mode='subscription',
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata or {},
        allow_promotion_codes=True,
        billing_address_collection='required',
        customer_update={'address': 'auto', 'name': 'auto'},
    )
    return session

def get_or_create_product_and_price():
    products = stripe.Product.list(limit=100)
    emirald_product = None
    for p in products.auto_paging_iter():
        if p.metadata.get('slug') == 'emirald-monthly':
            emirald_product = p
            break

    if not emirald_product:
        emirald_product = stripe.Product.create(
            name='Emirald Pro',
            description='Automated crypto trading bot with AI-powered decisions',
            metadata={'slug': 'emirald-monthly', 'type': 'subscription'},
            active=True,
        )

    prices = stripe.Price.list(product=emirald_product.id, limit=100)
    monthly_price = None
    for p in prices.auto_paging_iter():
        if p.recurring and p.recurring.interval == 'month' and p.unit_amount == 4700:
            monthly_price = p
            break

    if not monthly_price:
        monthly_price = stripe.Price.create(
            product=emirald_product.id,
            unit_amount=4700,
            currency='usd',
            recurring={'interval': 'month'},
            metadata={'tier': 'pro'},
        )

    return emirald_product, monthly_price

def hash_password(password):
    return hashlib.sha256((password + 'emirald_salt').encode()).hexdigest()

# ---------------------------------------------------------------------------
# Routes: Public Landing Page
# ---------------------------------------------------------------------------

@app.route('/')
def landing():
    user = get_current_user()
    product, price = get_or_create_product_and_price()
    return render_template('landing.html',
                           user=user,
                           stripe_publishable_key=STRIPE_PUBLISHABLE_KEY,
                           price_id=price.id,
                           price_amount=47,
                           version=EMIRALD_VERSION)

@app.route('/pricing')
def pricing():
    user = get_current_user()
    product, price = get_or_create_product_and_price()
    return render_template('pricing.html',
                           user=user,
                           stripe_publishable_key=STRIPE_PUBLISHABLE_KEY,
                           price_id=price.id,
                           price_amount=47)

# ---------------------------------------------------------------------------
# Routes: Authentication
# ---------------------------------------------------------------------------

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = users_db.get(email)
        if user and user.get('password_hash') == hash_password(password):
            session['user_id'] = email
            session['user_name'] = user.get('name', email)
            next_url = request.args.get('next') or url_for('dashboard')
            return redirect(next_url)

        flash('Invalid email or password', 'error')

    return render_template('login.html', user=get_current_user())

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        name = request.form.get('name', '').strip()

        if not email or not password:
            flash('Email and password are required', 'error')
            return render_template('register.html', user=get_current_user())

        if email in users_db:
            flash('Account already exists. Please log in.', 'error')
            return redirect(url_for('login'))

        users_db[email] = {
            'email': email,
            'name': name or email.split('@')[0],
            'password_hash': hash_password(password),
            'created_at': datetime.utcnow().isoformat(),
            'stripe_customer_id': None,
            'subscription_status': 'none',
            'subscription_id': None,
            'downloads': 0,
            'last_download': None,
        }
        save_users()

        session['user_id'] = email
        session['user_name'] = users_db[email]['name']
        return redirect(url_for('dashboard'))

    return render_template('register.html', user=get_current_user())

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('landing'))

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        user = users_db.get(email)

        if user:
            reset_token = secrets.token_urlsafe(32)
            user['reset_token'] = reset_token
            user['reset_expires'] = (datetime.utcnow() + timedelta(hours=1)).isoformat()
            save_users()
            print(f"RESET TOKEN for {email}: {reset_token}")
            flash(f'Password reset link sent to {email} (check console for demo token)', 'success')
        else:
            flash('If an account exists, a reset link has been sent.', 'success')

    return render_template('forgot_password.html', user=get_current_user())

@app.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    user = None
    for u in users_db.values():
        if u.get('reset_token') == token:
            if u.get('reset_expires') and datetime.fromisoformat(u['reset_expires']) > datetime.utcnow():
                user = u
                break

    if not user:
        flash('Invalid or expired reset token', 'error')
        return redirect(url_for('forgot_password'))

    if request.method == 'POST':
        password = request.form.get('password', '')
        confirm = request.form.get('confirm', '')

        if password != confirm:
            flash('Passwords do not match', 'error')
        elif len(password) < 8:
            flash('Password must be at least 8 characters', 'error')
        else:
            user['password_hash'] = hash_password(password)
            user.pop('reset_token', None)
            user.pop('reset_expires', None)
            save_users()
            flash('Password reset successful! Please log in.', 'success')
            return redirect(url_for('login'))

    return render_template('reset_password.html', user=get_current_user(), token=token)

# ---------------------------------------------------------------------------
# Routes: Stripe Checkout
# ---------------------------------------------------------------------------

@app.route('/create-checkout-session', methods=['POST'])
def create_checkout():
    user = get_current_user()

    if not user:
        return jsonify({'error': 'Not authenticated'}), 401

    if user.get('is_permanent_free'):
        return jsonify({'error': 'Already have permanent access'}), 400

    email = user['email']
    customer = create_or_get_stripe_customer(email, user.get('name'))
    product, price = get_or_create_product_and_price()

    success_url = url_for('checkout_success', _external=True) + '?session_id={CHECKOUT_SESSION_ID}'
    cancel_url = url_for('pricing', _external=True)

    checkout_session = create_checkout_session(
        customer_id=customer.id,
        price_id=price.id,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={'user_email': email, 'product': 'emirald_pro'},
    )

    pending_checkouts[checkout_session.id] = {
        'user_email': email,
        'created_at': datetime.utcnow().isoformat(),
        'price_id': price.id,
    }

    return jsonify({'sessionId': checkout_session.id, 'url': checkout_session.url})

@app.route('/checkout/success')
def checkout_success():
    session_id = request.args.get('session_id')

    if not session_id:
        flash('Invalid checkout session', 'error')
        return redirect(url_for('landing'))

    try:
        checkout_session = stripe.checkout.Session.retrieve(session_id)

        if checkout_session.payment_status == 'paid':
            user_email = checkout_session.metadata.get('user_email')
            subscription_id = checkout_session.subscription

            if user_email and user_email in users_db:
                users_db[user_email]['subscription_status'] = 'active'
                users_db[user_email]['subscription_id'] = subscription_id
                users_db[user_email]['stripe_customer_id'] = checkout_session.customer
                save_users()

                if 'user_id' not in session:
                    session['user_id'] = user_email
                    session['user_name'] = users_db[user_email]['name']

            flash('Welcome to Emirald Pro! Your subscription is active.', 'success')
        else:
            flash('Payment is still processing. Please check back in a moment.', 'info')
    except Exception as e:
        flash(f'Error verifying payment: {str(e)}', 'error')

    return redirect(url_for('dashboard'))

# ---------------------------------------------------------------------------
# Routes: User Dashboard
# ---------------------------------------------------------------------------

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_current_user()

    subscription_info = None
    if user.get('subscription_id') and not user.get('is_permanent_free'):
        try:
            sub = stripe.Subscription.retrieve(user['subscription_id'])
            subscription_info = {
                'status': sub.status,
                'current_period_end': datetime.fromtimestamp(sub.current_period_end).strftime('%B %d, %Y'),
                'cancel_at_period_end': sub.cancel_at_period_end,
            }
        except:
            pass
    elif user.get('is_permanent_free'):
        subscription_info = {
            'status': 'active',
            'current_period_end': 'Lifetime (Permanent Free)',
            'cancel_at_period_end': False,
        }

    return render_template('dashboard.html',
                           user=user,
                           subscription=subscription_info,
                           version=EMIRALD_VERSION,
                           download_url=EMIRALD_DOWNLOAD_URL)

# ---------------------------------------------------------------------------
# Routes: Download Validation
# ---------------------------------------------------------------------------

@app.route('/validate-download', methods=['POST'])
@login_required
def validate_download():
    user = get_current_user()

    if user.get('subscription_status') != 'active':
        return jsonify({
            'valid': False,
            'error': 'Active subscription required',
            'redirect': url_for('pricing')
        }), 403

    if not user.get('is_permanent_free') and user.get('subscription_id'):
        try:
            sub = stripe.Subscription.retrieve(user['subscription_id'])
            if sub.status not in ['active', 'trialing']:
                user['subscription_status'] = sub.status
                save_users()
                return jsonify({
                    'valid': False,
                    'error': f'Subscription is {sub.status}',
                    'redirect': url_for('pricing')
                }), 403
        except Exception as e:
            return jsonify({'valid': False, 'error': 'Could not verify subscription'}), 500

    user['downloads'] = user.get('downloads', 0) + 1
    user['last_download'] = datetime.utcnow().isoformat()
    save_users()

    download_token = secrets.token_urlsafe(32)
    session['download_token'] = download_token
    session['download_expires'] = (datetime.utcnow() + timedelta(minutes=5)).timestamp()

    return jsonify({
        'valid': True,
        'download_url': url_for('secure_download', token=download_token, _external=True),
        'version': EMIRALD_VERSION,
        'message': 'Download authorized. Starting...'
    })

@app.route('/download/<token>')
@login_required
def secure_download(token):
    if session.get('download_token') != token:
        flash('Invalid or expired download link', 'error')
        return redirect(url_for('dashboard'))

    if session.get('download_expires', 0) < time.time():
        flash('Download link expired', 'error')
        return redirect(url_for('dashboard'))

    session.pop('download_token', None)
    session.pop('download_expires', None)

    return redirect(EMIRALD_DOWNLOAD_URL)

# ---------------------------------------------------------------------------
# Routes: Stripe Webhooks
# ---------------------------------------------------------------------------

@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')

    if not verify_webhook_signature(payload, sig_header):
        return 'Invalid signature', 400

    event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)

    if event['type'] == 'checkout.session.completed':
        handle_checkout_completed(event['data']['object'])
    elif event['type'] == 'customer.subscription.updated':
        handle_subscription_updated(event['data']['object'])
    elif event['type'] == 'customer.subscription.deleted':
        handle_subscription_deleted(event['data']['object'])
    elif event['type'] == 'invoice.payment_failed':
        handle_payment_failed(event['data']['object'])

    return jsonify({'received': True})

def handle_checkout_completed(session_obj):
    user_email = session_obj.metadata.get('user_email')
    subscription_id = session_obj.subscription

    if user_email and user_email in users_db:
        users_db[user_email]['subscription_status'] = 'active'
        users_db[user_email]['subscription_id'] = subscription_id
        users_db[user_email]['stripe_customer_id'] = session_obj.customer
        save_users()

def handle_subscription_updated(subscription):
    customer_id = subscription.customer
    for email, user in users_db.items():
        if user.get('stripe_customer_id') == customer_id and not user.get('is_permanent_free'):
            users_db[email]['subscription_status'] = subscription.status
            users_db[email]['subscription_id'] = subscription.id
            if subscription.cancel_at_period_end:
                users_db[email]['cancel_at_period_end'] = True
            save_users()
            break

def handle_subscription_deleted(subscription):
    customer_id = subscription.customer
    for email, user in users_db.items():
        if user.get('stripe_customer_id') == customer_id and not user.get('is_permanent_free'):
            users_db[email]['subscription_status'] = 'canceled'
            users_db[email]['subscription_id'] = None
            save_users()
            break

def handle_payment_failed(invoice):
    customer_id = invoice.customer
    for email, user in users_db.items():
        if user.get('stripe_customer_id') == customer_id and not user.get('is_permanent_free'):
            users_db[email]['subscription_status'] = 'past_due'
            save_users()
            break

# ---------------------------------------------------------------------------
# Routes: API for Electron App
# ---------------------------------------------------------------------------

@app.route('/api/validate-license', methods=['POST'])
def api_validate_license():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    machine_id = data.get('machine_id', '')

    if not email or not password:
        return jsonify({'valid': False, 'error': 'Credentials required'}), 400

    user = users_db.get(email)
    if not user or user.get('password_hash') != hash_password(password):
        return jsonify({'valid': False, 'error': 'Invalid credentials'}), 401

    if user.get('subscription_status') != 'active':
        return jsonify({
            'valid': False,
            'error': 'Active subscription required',
            'subscription_status': user.get('subscription_status')
        }), 403

    if not user.get('is_permanent_free') and user.get('subscription_id'):
        try:
            sub = stripe.Subscription.retrieve(user['subscription_id'])
            if sub.status not in ['active', 'trialing']:
                return jsonify({
                    'valid': False,
                    'error': f'Subscription is {sub.status}',
                    'subscription_status': sub.status
                }), 403
        except:
            return jsonify({'valid': False, 'error': 'Could not verify subscription'}), 500

    app_token = secrets.token_urlsafe(32)
    user['app_tokens'] = user.get('app_tokens', {})
    user['app_tokens'][app_token] = {
        'created': datetime.utcnow().isoformat(),
        'machine_id': machine_id,
        'last_used': datetime.utcnow().isoformat(),
    }
    save_users()

    return jsonify({
        'valid': True,
        'token': app_token,
        'user': {
            'email': user['email'],
            'name': user['name'],
            'subscription_status': user['subscription_status'],
            'is_permanent_free': user.get('is_permanent_free', False),
            'version': EMIRALD_VERSION,
        }
    })

@app.route('/api/app-heartbeat', methods=['POST'])
def api_heartbeat():
    data = request.get_json()
    token = data.get('token')

    if not token:
        return jsonify({'valid': False}), 401

    for email, user in users_db.items():
        tokens = user.get('app_tokens', {})
        if token in tokens:
            tokens[token]['last_used'] = datetime.utcnow().isoformat()
            save_users()
            return jsonify({'valid': True, 'version': EMIRALD_VERSION})

    return jsonify({'valid': False}), 401

# ---------------------------------------------------------------------------
# AI Chat Support API
# ---------------------------------------------------------------------------

@app.route('/api/chat', methods=['POST'])
def api_chat():
    """AI Chat Support endpoint - proxies to free LLM rotator or provides fallback"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400

    messages = data.get('messages', [])
    session_id = data.get('session_id', '')
    user_info = data.get('user_info', {})
    temperature = data.get('temperature', 0.7)
    max_tokens = data.get('max_tokens', 1500)

    # System prompt for Emirald AI Support Specialist
    system_prompt = """You are Emirald AI Support Specialist, a 24/7 customer support agent for Emirald - an AI-powered automated crypto trading bot for BloFin.

YOUR PERSONALITY:
- Warm, personable, and courteous
- Deeply knowledgeable about Emirald's codebase, architecture, and features
- Patient with beginners, technical with advanced users
- Available 24/7, never rushed
- Speak naturally, use emojis appropriately
- Always offer to help further

YOUR EXPERTISE:
- Emirald Electron app (main.js, preload.js, renderer tabs)
- Free Claude Router (LLM rotator on port 8082)
- Emirald Dashboard (FastAPI on port 8766)
- Emirald Trading Bot (Python, 60-second LLM decisions, BloFin USDT-M Futures)
- Stripe billing, subscriptions, webhooks
- BloFin API integration (HMAC-SHA256, 10x leverage, 3% SL, 25% TP)
- GitHub Pages deployment, Electron builder, NSIS installers
- Common issues: installation, API keys, credential testing, bot startup, dashboard access

YOUR APPROACH:
1. Greet warmly, ask how you can help
2. Diagnose issues systematically
3. Provide step-by-step solutions
4. Share relevant code snippets when helpful
5. Always end with "Is there anything else I can help you with?"
6. If you don't know something, be honest and offer to escalate"""

    # Try to proxy to free LLM rotator first
    # Use deployed HF Space rotator for public access, fallback to local
    import os
    rotator_url = os.environ.get('HF_ROTATOR_URL', 'http://127.0.0.1:8082') + '/v1/chat/completions'
    payload = {
        'messages': [
            {'role': 'system', 'content': system_prompt},
            *messages
        ],
        'temperature': temperature,
        'max_tokens': max_tokens,
        'session_id': session_id,
        'user_info': user_info
    }

    try:
        response = requests.post(rotator_url, json=payload, timeout=30)
        if response.ok:
            data = response.json()
            return jsonify({
                'response': data.get('choices', [{}])[0].get('message', {}).get('content', 'I\'m here to help! What can I assist you with?'),
                'source': 'rotator'
            })
    except Exception as e:
        print(f'Rotator unavailable: {e}')

    # Fallback responses for common queries when rotator is down
    fallback_responses = {
        'install': "I'm having trouble connecting to the AI rotator right now, but I can still help! For installation issues:\n\n**Common fixes:**\n• Run installer as Administrator\n• If Windows SmartScreen blocks it: Click 'More info' → 'Run anyway'\n• Disable antivirus temporarily during install\n• Ensure Windows 10/11 (64-bit)\n\nThe installer is at `C:\\Users\\Downloads\\Emirald Setup 1.0.0.exe`\n\nWhat specific error are you seeing?",
        'api key': "For BloFin API key issues:\n\n**Checklist:**\n1. API Key, Secret, and Passphrase all entered correctly\n2. Broker ID (optional) - leave blank if not provided\n3. Permissions: Read + Trade (not withdraw)\n4. IP whitelist: Add your IP or leave empty\n\nTest in the Setup tab → 'Test Credentials' button\n\nWhat error does the credential test show?",
        'rotator': "The free LLM rotator runs on port 8082. If it's not starting:\n\n**Check:**\n• Python 3.12+ in Emirald venv\n• Port 8082 not in use\n• `free-claude-router` folder exists\n• Run manually: `python router.py`\n\nThe Electron app starts it automatically on the Setup tab.",
        'dashboard': "Dashboard runs on port 8766 (FastAPI/uvicorn). If not loading:\n\n**Check:**\n• Config.yaml exists in Emirald folder\n• Port 8766 free\n• Uvicorn installed in venv\n• Run: `python -m uvicorn apps.dashboard.main:app --port 8766`\n\nAccess at http://127.0.0.1:8766/",
        'stripe': "For Stripe billing issues:\n\n• Check webhook endpoint: `/webhook/stripe`\n• Events: checkout.session.completed, subscription.updated/deleted, invoice.payment_failed\n• Test mode vs live mode keys\n• Customer portal for subscription management\n\nWhat specific billing issue?",
        'default': "I'm your Emirald AI Support Specialist! 👋 While I reconnect to the full AI, here's quick help:\n\n**Most common issues:**\n• **Install errors** → Run as Admin, allow SmartScreen\n• **API keys** → Test in Setup tab, check permissions\n• **Rotator** → Port 8082, check Python venv\n• **Dashboard** → Port 8766, check config.yaml\n• **Bot won't start** → Check .env has valid keys\n\nWhat are you working on? I'll give you specific steps."
    }

    # Simple keyword matching for fallback
    user_msg = ''
    for msg in messages:
        if msg.get('role') == 'user':
            user_msg = msg.get('content', '').lower()

    response_text = fallback_responses['default']
    for key, resp in fallback_responses.items():
        if key in user_msg:
            response_text = resp
            break

    return jsonify({
        'response': response_text,
        'source': 'fallback',
        'note': 'Using fallback responses - LLM rotator unavailable'
    })

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)