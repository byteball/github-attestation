# Github Attestation Bot
A bot that attests Github account

# Setup
* Run `npm install` to install node modules.
* Run `node attestation.js` first time to generate keys.
* Run `node db_import.js` to import `db.sql` into the database.
* Configure `admin_email`, `from_email`, `site`, `GithubClientId`, `GithubClientSecret` and `salt` values in new conf.json file (desktopApp.getAppDataDir() folder). Read more about other configuration options [there](https://github.com/byteball/headless-obyte#customize).
* Run `node attestation.js` again.

# Testnet
* Run `cp .env.testnet .env` to connect to TESTNET hub. Delete and import the database again if you already ran it on MAINNET.
* Change `bLight` value to true in conf.json file, so you would not need to wait for long syncing.
* Change `socksHost` and `socksPort` values to null in conf.json file, if you are not using TOR.
