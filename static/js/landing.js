// Emirald Landing Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize loading screen
    const loadingScreen = document.getElementById('loading-screen');
    const loadingProgress = document.querySelector('.loading-progress');
    let loadingProgressValue = 0;

    // Simulate loading progress
    const loadingInterval = setInterval(() => {
        loadingProgressValue += Math.random() * 30;
        if (loadingProgressValue >= 100) {
            loadingProgressValue = 100;
            clearInterval(loadingInterval);
            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }, 500);
        }
        loadingProgress.style.width = loadingProgressValue + '%';
    }, 200);

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // FAQ accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isActive = question.classList.contains('active');

            // Close all other FAQs
            faqQuestions.forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.classList.remove('active');
            });

            // Toggle current FAQ
            if (!isActive) {
                question.classList.add('active');
                answer.classList.add('active');
            }
        });
    });

    // Scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('scroll-reveal', 'active');
            }
        });
    }, observerOptions);

    // Observe elements for scroll animation
    document.querySelectorAll('.feature-card, .testimonial-card, .pricing-card').forEach(el => {
        observer.observe(el);
    });

    // Flash message auto-hide
    const flashMessages = document.querySelectorAll('.flash');
    flashMessages.forEach((flash, index) => {
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => {
                flash.remove();
            }, 300);
        }, 5000);
    });

    // Form validation
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', (e) => {
            const requiredInputs = form.querySelectorAll('[required]');
            let isValid = true;

            requiredInputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = 'var(--error)';
                } else {
                    input.style.borderColor = '';
                }
            });

            if (!isValid) {
                e.preventDefault();
                showFlash('Please fill in all required fields', 'error');
            }
        });
    });

    // Password strength indicator
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        input.addEventListener('input', () => {
            const strength = calculatePasswordStrength(input.value);
            updatePasswordStrength(input, strength);
        });
    });

    // Stripe checkout integration
    const checkoutButtons = document.querySelectorAll('[data-checkout]');
    checkoutButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();

            const userEmail = button.getAttribute('data-user-email');
            const priceId = button.getAttribute('data-price-id');

            try {
                const response = await fetch('/create-checkout-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        user_email: userEmail,
                        price_id: priceId
                    })
                });

                const data = await response.json();

                if (data.url) {
                    // Redirect to Stripe checkout
                    window.location.href = data.url;
                } else {
                    showFlash('Error creating checkout session', 'error');
                }
            } catch (error) {
                console.error('Checkout error:', error);
                showFlash('Error processing checkout', 'error');
            }
        });
    });

    // Download validation
    const downloadButtons = document.querySelectorAll('[data-download]');
    downloadButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
                const response = await fetch('/validate-download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({})
                });

                const data = await response.json();

                if (data.valid) {
                    showFlash(data.message, 'success');
                    setTimeout(() => {
                        window.location.href = data.download_url;
                    }, 1000);
                } else {
                    showFlash(data.error, 'error');
                    if (data.redirect) {
                        setTimeout(() => {
                            window.location.href = data.redirect;
                        }, 2000);
                    }
                }
            } catch (error) {
                console.error('Download validation error:', error);
                showFlash('Error validating download', 'error');
            }
        });
    });

    // Copy to clipboard functionality
    const copyButtons = document.querySelectorAll('[data-copy]');
    copyButtons.forEach(button => {
        button.addEventListener('click', () => {
            const textToCopy = button.getAttribute('data-copy');

            navigator.clipboard.writeText(textToCopy).then(() => {
                showFlash('Copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Failed to copy:', err);
                showFlash('Failed to copy text', 'error');
            });
        });
    });

    // Live stats animation
    animateStats();

    // Initialize tooltips
    initTooltips();
});

// Utility functions
function showFlash(message, type = 'info') {
    const flashContainer = document.getElementById('flash-container');
    if (!flashContainer) return;

    const flash = document.createElement('div');
    flash.className = `flash flash-${type}`;
    flash.textContent = message;

    flashContainer.appendChild(flash);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => {
            flash.remove();
        }, 300);
    }, 5000);
}

function calculatePasswordStrength(password) {
    let strength = 0;

    // Length check
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;

    // Character variety
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;

    return Math.min(strength, 5);
}

function updatePasswordStrength(input, strength) {
    let strengthText = '';
    let strengthColor = '';

    switch(strength) {
        case 0:
        case 1:
            strengthText = 'Very Weak';
            strengthColor = '#ff6b6b';
            break;
        case 2:
            strengthText = 'Weak';
            strengthColor = '#ffd93d';
            break;
        case 3:
            strengthText = 'Medium';
            strengthColor = '#4ecdc4';
            break;
        case 4:
            strengthText = 'Strong';
            strengthColor = '#45b7d1';
            break;
        case 5:
            strengthText = 'Very Strong';
            strengthColor = '#51cf66';
            break;
    }

    // Create or update strength indicator
    let strengthIndicator = input.parentNode.querySelector('.password-strength');
    if (!strengthIndicator) {
        strengthIndicator = document.createElement('div');
        strengthIndicator.className = 'password-strength';
        input.parentNode.appendChild(strengthIndicator);
    }

    strengthIndicator.textContent = `Password strength: ${strengthText}`;
    strengthIndicator.style.color = strengthColor;
    strengthIndicator.style.fontSize = '0.875rem';
    strengthIndicator.style.marginTop = '0.25rem';
}

function animateStats() {
    const statNumbers = document.querySelectorAll('.stat-number');

    statNumbers.forEach(stat => {
        const target = parseInt(stat.getAttribute('data-target') || stat.textContent);
        const duration = 2000;
        const increment = target / (duration / 16);
        let current = 0;

        const updateNumber = () => {
            current += increment;
            if (current < target) {
                stat.textContent = Math.floor(current).toLocaleString();
                requestAnimationFrame(updateNumber);
            } else {
                stat.textContent = target.toLocaleString();
            }
        };

        // Start animation when element is in view
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateNumber();
                    observer.unobserve(entry.target);
                }
            });
        });

        observer.observe(stat);
    });
}

function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');

    tooltipElements.forEach(element => {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = element.getAttribute('data-tooltip');

        element.addEventListener('mouseenter', () => {
            document.body.appendChild(tooltip);

            const rect = element.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.bottom + 10 + 'px';
        });

        element.addEventListener('mouseleave', () => {
            tooltip.remove();
        });
    });
}

// Add tooltip styles
const tooltipStyles = document.createElement('style');
tooltipStyles.textContent = `
    .tooltip {
        position: fixed;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 0.5rem 0.75rem;
        border-radius: 4px;
        font-size: 0.875rem;
        pointer-events: none;
        z-index: 1000;
        white-space: nowrap;
    }
`;
document.head.appendChild(tooltipStyles);