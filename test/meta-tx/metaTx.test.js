import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiBN from 'chai-bn'
import BN from 'bn.js'
import { defaultAbiCoder as abi } from 'ethers/utils/abi-coder'
import { expectRevert } from '@openzeppelin/test-helpers'

import * as deployer from '../helpers/deployer'
import { mockValues } from '../helpers/constants'
import { generateFirstWallets } from '../helpers/utils'
import * as sigUtils from 'eth-sig-util'
import * as ethUtils from 'ethereumjs-util'

const ChildERC20 = artifacts.require('ChildERC20')
const ChildERC721 = artifacts.require('ChildERC721')

chai
  .use(chaiAsPromised)
  .use(chaiBN(BN))
  .should()

const should = chai.should()
const web3ChildERC20 = new web3.eth.Contract(ChildERC20.abi)
const web3ChildERC721 = new web3.eth.Contract(ChildERC721.abi)
const wallets = generateFirstWallets({ n: 10 })

contract('IChildToken', (accounts) => {
  describe('Burn ChildERC20 using meta transaction', () => {
    const depositAmount = mockValues.amounts[6]
    const withdrawAmount = mockValues.amounts[3]
    const admin = accounts[0]
    const user = wallets[2].getAddressString()
    const userPK = ethUtils.toBuffer(wallets[2].getPrivateKeyString())
    let contracts
    let dummyERC20

    before(async() => {
      contracts = await deployer.deployFreshChildContracts(accounts)
      dummyERC20 = contracts.dummyERC20
      const depositData = abi.encode(['uint256'], [depositAmount.toString(10)])
      await dummyERC20.deposit(user, depositData)
    })

    it('User should own tokens', async() => {
      const balance = await dummyERC20.balanceOf(user)
      balance.should.be.bignumber.gt(withdrawAmount)
    })

    it('Can receive withdraw tx', async() => {
      const functionSignature = await web3ChildERC20.methods.withdraw(withdrawAmount.toString(10)).encodeABI()
      const name = await dummyERC20.name()
      const chainId = await dummyERC20.getChainId()
      const nonce = await dummyERC20.getNonce(user)
      const sig = sigUtils.signTypedData(userPK, {
        data: getTypedData({
          name,
          version: '1',
          chainId: '0x' + chainId.toString(16),
          verifyingContract: dummyERC20.address,
          nonce: '0x' + nonce.toString(16),
          from: user,
          functionSignature: ethUtils.toBuffer(functionSignature)
        })
      })
      const { r, s, v } = getSignatureParameters(sig)
      const tx = await dummyERC20.executeMetaTransaction(user, functionSignature, r, s, v, { from: admin })
      should.exist(tx)
    })

    it('Tokens should be burned for user', async() => {
      const balance = await dummyERC20.balanceOf(user)
      balance.should.be.bignumber.that.equals(depositAmount.sub(withdrawAmount))
    })
  })

  describe('Burn ChildERC721 using meta transaction', () => {
    const tokenId = mockValues.numbers[6]
    const admin = accounts[0]
    const user = wallets[2].getAddressString()
    const userPK = ethUtils.toBuffer(wallets[2].getPrivateKeyString())
    let contracts
    let dummyERC721

    before(async() => {
      contracts = await deployer.deployFreshChildContracts(accounts)
      dummyERC721 = contracts.dummyERC721
      const depositData = abi.encode(['uint256'], [tokenId])
      await dummyERC721.deposit(user, depositData)
    })

    it('User should own token', async() => {
      const owner = await dummyERC721.ownerOf(tokenId)
      owner.toLowerCase().should.equal(user.toLowerCase())
    })

    it('Can receive withdraw tx', async() => {
      const functionSignature = await web3ChildERC721.methods.withdraw(tokenId).encodeABI()
      const name = await dummyERC721.name()
      const chainId = await dummyERC721.getChainId()
      const nonce = await dummyERC721.getNonce(user)

      const sig = sigUtils.signTypedData(userPK, {
        data: getTypedData({
          name,
          version: '1',
          chainId: '0x' + chainId.toString(16),
          verifyingContract: dummyERC721.address,
          nonce: '0x' + nonce.toString(16),
          from: user,
          functionSignature: ethUtils.toBuffer(functionSignature)
        })
      })
      const { r, s, v } = getSignatureParameters(sig)
      const tx = await dummyERC721.executeMetaTransaction(user, functionSignature, r, s, v, { from: admin })
      should.exist(tx)
    })

    it('Token should not exist after burning', async() => {
      await expectRevert(dummyERC721.ownerOf(tokenId), 'ERC721: owner query for nonexistent token')
    })
  })

  describe('Burn ChildERC20 using meta transaction signed for ERC721', () => {
    const tokenId = mockValues.numbers[6]
    const admin = accounts[0]
    const user = wallets[2].getAddressString()
    const userPK = ethUtils.toBuffer(wallets[2].getPrivateKeyString())
    let contracts
    let dummyERC721
    let dummyERC20

    before(async() => {
      contracts = await deployer.deployFreshChildContracts(accounts)
      dummyERC721 = contracts.dummyERC721
      dummyERC20 = contracts.dummyERC20
      const depositData = abi.encode(['uint256'], [tokenId])
      await dummyERC721.deposit(user, depositData)
      await dummyERC20.deposit(user, depositData)
    })

    it('Should revert transaction', async() => {
      const functionSignature = await web3ChildERC721.methods.withdraw(tokenId).encodeABI()
      const name = await dummyERC721.name()
      const chainId = await dummyERC721.getChainId()
      const nonce = await dummyERC721.getNonce(user)

      const sig = sigUtils.signTypedData(userPK, {
        data: getTypedData({
          name,
          version: '1',
          chainId: '0x' + chainId.toString(16),
          verifyingContract: dummyERC721.address,
          nonce: '0x' + nonce.toString(16),
          from: user,
          functionSignature: ethUtils.toBuffer(functionSignature)
        })
      })
      const { r, s, v } = getSignatureParameters(sig)
      await expectRevert(
        dummyERC20.executeMetaTransaction(user, functionSignature, r, s, v, { from: admin }),
        'Transaction has been reverted by the EVM')
    })
  })
})

const getTypedData = ({ name, version, chainId, verifyingContract, nonce, from, functionSignature }) => {
  return {
    types: {
      EIP712Domain: [{
        name: 'name',
        type: 'string'
      }, {
        name: 'version',
        type: 'string'
      }, {
        name: 'chainId',
        type: 'uint256'
      }, {
        name: 'verifyingContract',
        type: 'address'
      }],
      MetaTransaction: [{
        name: 'nonce',
        type: 'uint256'
      }, {
        name: 'from',
        type: 'address'
      }, {
        name: 'functionSignature',
        type: 'bytes'
      }]
    },
    domain: {
      name,
      version,
      chainId,
      verifyingContract
    },
    primaryType: 'MetaTransaction',
    message: {
      nonce,
      from,
      functionSignature
    }
  }
}

const getSignatureParameters = (signature) => {
  const r = signature.slice(0, 66)
  const s = '0x'.concat(signature.slice(66, 130))
  const _v = '0x'.concat(signature.slice(130, 132))
  let v = parseInt(_v)
  if (![27, 28].includes(v)) v += 27
  return { r, s, v }
}