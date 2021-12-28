const { expect } = require('chai')
const path = require('path')
const AA_PATH = '../github.aa'
const { ATTESTOR_MNEMONIC, ATTESTOR_ADDRESS, BOUNCE_FEE } = require('./constants')

describe('GitHub attestation AA', function () {
	this.timeout(120000)

	before(async () => {
		this.network = await Network.create()
			.with.numberOfWitnesses(1)
			.with.agent({ github_aa: path.join(__dirname, AA_PATH) })
			.with.wallet({ attestor: 100e9 }, ATTESTOR_MNEMONIC)
			.with.wallet({ alice: 100e9 })
			.run()

		this.github_aa = this.network.agent.github_aa
		this.alice = this.network.wallet.alice
		this.attestor = this.network.wallet.attestor
		this.attestorAddress = await this.attestor.getAddress()
		expect(this.attestorAddress).to.eq(ATTESTOR_ADDRESS)
	})


	it('Attestation attempt by a non-attestor', async () => {
		const address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const github_username = 'someone'
		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.true
		expect(response.response_unit).to.be.null
		expect(response.response.error).to.be.equal("only the attestor can call this AA")

	})


	it('Initial attestation', async () => {
		const address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const github_username = 'alice'
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null
		expect(response.response.responseVars.message).to.be.equal(`${github_username} => ${address}`)

		const { vars } = await this.attestor.readAAStateVars(this.github_aa)
		expect(vars['a2u_' + address]).to.be.equal(github_username)
		expect(vars['u2a_' + github_username]).to.be.equal(address)
	})


	it('Another username of alice', async () => {
		const address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const github_username = 'alice2'
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null
		expect(response.response.responseVars.message).to.be.equal(`${github_username} => ${address}`)

		const { vars } = await this.attestor.readAAStateVars(this.github_aa)
		expect(vars['a2u_' + address]).to.be.equal(github_username)
		expect(vars['u2a_' + github_username]).to.be.equal(address)
	})


	it('Change the address of alice', async () => {
		const old_address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const address = 'FAB6TH7IRAVHDLK2AAWY5YBE6CEBUACF'
		const github_username = 'alice'
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null
		expect(response.response.responseVars.message).to.be.equal(`This attestation would overwrite an existing record and can't be activated immediately for security reasons. Please repeat your attestation in 3 days to activate the new owner of this github username.`)

		const { vars } = await this.attestor.readAAStateVars(this.github_aa)
		expect(vars['a2u_' + old_address]).to.be.equal('alice2')
		expect(vars['a2u_' + address]).to.be.undefined
		expect(vars['u2a_' + github_username]).to.be.equal(old_address)
		expect(vars['pending_' + address + '_' + github_username]).to.be.equal(response.timestamp)
	})


	it('Change the address of alice again without waiting', async () => {
		const old_address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const address = 'FAB6TH7IRAVHDLK2AAWY5YBE6CEBUACF'
		const github_username = 'alice'
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.true
		expect(response.response_unit).to.be.null
		expect(response.response.error).to.be.equal("the delay period is still ongoing")

	})


	it('Change the address of alice again after waiting', async () => {
		const { error: tt_error } = await this.network.timetravel({ shift: '3d' })
		expect(tt_error).to.be.null

		const old_address = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'
		const address = 'FAB6TH7IRAVHDLK2AAWY5YBE6CEBUACF'
		const github_username = 'alice'
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				address,
				github_username
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.null
		expect(response.response.responseVars.message).to.be.equal(`${github_username} => ${address}`)

		const { vars } = await this.attestor.readAAStateVars(this.github_aa)
		expect(vars['a2u_' + old_address]).to.be.equal('alice2')
		expect(vars['a2u_' + address]).to.be.eq(github_username)
		expect(vars['u2a_' + github_username]).to.be.equal(address)
		expect(vars['pending_' + address + '_' + github_username]).to.be.undefined
	})

	it('Withdraw the accumulated bounce fees', async () => {
		const amount = 30000
		const { unit, error } = await this.attestor.triggerAaWithData({
			toAddress: this.github_aa,
			amount: BOUNCE_FEE,
			data: {
				withdraw: 1,
				amount
			}
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
	//	await this.network.witnessUntilStable(unit)

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false
		expect(response.response_unit).to.be.validUnit

		const { unitObj } = await this.attestor.getUnitInfo({ unit: response.response_unit })
		expect(Utils.getExternalPayments(unitObj)).to.deep.equalInAnyOrder([
			{
				address: this.attestorAddress,
				amount: amount,
			},
		])

	})


	after(async () => {
		await this.network.stop()
	})
})
