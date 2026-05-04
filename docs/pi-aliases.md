# ─── Gaspar ───────────────────────────────────────────────

alias m-g-start='sudo systemctl start gaspar'
alias m-g-stop='sudo systemctl stop gaspar'
alias m-g-restart='sudo systemctl restart gaspar'
alias m-g-status='sudo systemctl status gaspar'
alias m-g-enable='sudo systemctl enable gaspar'
alias m-g-disable='sudo systemctl disable gaspar'
alias m-g-edit='sudo systemctl edit --full gaspar'
alias m-g-logs='sudo journalctl -u gaspar -n 100 --no-pager'
alias m-g-follow='sudo journalctl -fu gaspar'
alias m-g-boot='sudo journalctl -u gaspar -b'

# ─── Worfbot Gateway ──────────────────────────────────────

alias m-w-start='sudo systemctl start worfbot-gateway'
alias m-w-stop='sudo systemctl stop worfbot-gateway'
alias m-w-restart='sudo systemctl restart worfbot-gateway'
alias m-w-status='sudo systemctl status worfbot-gateway'
alias m-w-enable='sudo systemctl enable worfbot-gateway'
alias m-w-disable='sudo systemctl disable worfbot-gateway'
alias m-w-edit='sudo systemctl edit --full worfbot-gateway'
alias m-w-logs='sudo journalctl -u worfbot-gateway -n 100 --no-pager'
alias m-w-follow='sudo journalctl -fu worfbot-gateway'
alias m-w-boot='sudo journalctl -u worfbot-gateway -b'

# ─── Fiendlord Keep ───────────────────────────────────────

alias m-f-start='sudo systemctl start fiendlord-keep'
alias m-f-stop='sudo systemctl stop fiendlord-keep'
alias m-f-restart='sudo systemctl restart fiendlord-keep'
alias m-f-status='sudo systemctl status fiendlord-keep'
alias m-f-enable='sudo systemctl enable fiendlord-keep'
alias m-f-disable='sudo systemctl disable fiendlord-keep'
alias m-f-edit='sudo systemctl edit --full fiendlord-keep'
alias m-f-logs='sudo journalctl -u fiendlord-keep -n 100 --no-pager'
alias m-f-follow='sudo journalctl -fu fiendlord-keep'
alias m-f-boot='sudo journalctl -u fiendlord-keep -b'

# ─── All services ─────────────────────────────────────────

alias m-all-status='sudo systemctl status gaspar worfbot-gateway fiendlord-keep'
alias m-all-restart='sudo systemctl restart gaspar worfbot-gateway fiendlord-keep'
alias m-all-stop='sudo systemctl stop gaspar worfbot-gateway fiendlord-keep'

# --- Homebridge -----------------------------------------

alias m-hb-status='systemctl status homebridge'
alias m-hb-restart='sudo systemctl restart homebridge'
alias m-hb='hb-service'

# ─── Actions Runner (magus) ───────────────────────────────

alias m-r-start='sudo systemctl start actions.runner.musicbender-zeal.magus'
alias m-r-stop='sudo systemctl stop actions.runner.musicbender-zeal.magus'
alias m-r-restart='sudo systemctl restart actions.runner.musicbender-zeal.magus'
alias m-r-status='sudo systemctl status actions.runner.musicbender-zeal.magus'
alias m-r-enable='sudo systemctl enable actions.runner.musicbender-zeal.magus'
alias m-r-disable='sudo systemctl disable actions.runner.musicbender-zeal.magus'
alias m-r-edit='sudo systemctl edit --full actions.runner.musicbender-zeal.magus'
alias m-r-logs='sudo journalctl -u actions.runner.musicbender-zeal.magus -n 100 --no-pager'
alias m-r-follow='sudo journalctl -fu actions.runner.musicbender-zeal.magus'
alias m-r-boot='sudo journalctl -u actions.runner.musicbender-zeal.magus -b'

# --- Other ----------------------------------------------

alias z='source ~/.bashrc'
