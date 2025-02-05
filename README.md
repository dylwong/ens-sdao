# Zap Name Server
The Zap Name Server is a permissionless, open system for translating Web 3 Domains to Arbitrary Endpoints
The Zap Name Server is organized around an ENS or ZNS (Zap Name Server) domain name (e.g `satoshi.zap`), which is owned by the subscribers.

Subscribers are all Delegates of the Zap VM
Delegates are leased a Zap Name Server Account (user1.vm.zap) in exchange for staking ZAP

# NPM Package

## Installation

If using npm
```console
npm install @sismo-core/ens-sdao
```
If using yarn
```console
yarn add @sismo-core/ens-sdao
```
## Usage

Once the package installed, the contracts are available using regular solidity imports.

Your Subdomain DAO contract can be constructed by using the available extensions.

As an example, here is the Sismo Subdomain DAO contract used for one of our releases
```solidity
pragma solidity >=0.8.4;

import {PublicResolver} from '@ensdomains/ens-contracts/contracts/resolvers/PublicResolver.sol';
import {ENS} from '@ensdomains/ens-contracts/contracts/registry/ENS.sol';
import {SDaoRegistrar} from '@sismo-core/ens-sdao/contracts/sdao/SDaoRegistrar.sol';
import {SDaoRegistrarLimited} from '@sismo-core/ens-sdao/contracts/sdao/extensions/SDaoRegistrarLimited.sol';
import {SDaoRegistrarReserved} from '@sismo-core/ens-sdao/contracts/sdao/extensions/SDaoRegistrarReserved.sol';
import {SDaoRegistrarERC721Generator, IERC721Minter} from '@sismo-core/ens-sdao/contracts/sdao/extensions/SDaoRegistrarERC721Generator.sol';
import {SDaoRegistrarCodeAccessible} from '@sismo-core/ens-sdao/contracts/sdao/extensions/SDaoRegistrarCodeAccessible.sol';

contract SismoSDaoRegistrar is
  SDaoRegistrar,
  SDaoRegistrarLimited,
  SDaoRegistrarReserved,
  SDaoRegistrarERC721Generator,
  SDaoRegistrarCodeAccessible
{
  uint256 public _groupId;

  event GroupIdUpdated(uint256 groupId);

  constructor(
    ENS ensAddr,
    PublicResolver resolver,
    IERC721Minter erc721Token,
    bytes32 node,
    address owner,
    uint256 reservationDuration,
    uint256 registrationLimit,
    uint256 groupId,
    address codeSigner
  )
    SDaoRegistrarCodeAccessible('Sismo', '1.0', codeSigner)
    SDaoRegistrarERC721Generator(erc721Token)
    SDaoRegistrarLimited(registrationLimit)
    SDaoRegistrarReserved(reservationDuration)
    SDaoRegistrar(ensAddr, resolver, node, owner)
  {
    _groupId = groupId;
  }

  function _beforeRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override(
      SDaoRegistrar,
      SDaoRegistrarReserved,
      SDaoRegistrarLimited,
      SDaoRegistrarERC721Generator
    )
  {
    super._beforeRegistration(account, labelHash);
  }

  function _afterRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override(SDaoRegistrar, SDaoRegistrarLimited, SDaoRegistrarERC721Generator)
  {
    super._afterRegistration(account, labelHash);
  }

  function _getCurrentGroupId() internal view override returns (uint256) {
    return _groupId;
  }

  function updateGroupId(uint256 groupId) external onlyOwner {
    _groupId = groupId;
    emit GroupIdUpdated(groupId);
  }
}
```
# SDAO Contracts

The core contract `SDaoRegistrar` distributes subdomains to registrants. This contract must be set as the owner of the DAO domain name (e.g `domain.eth`). It contains the registration logic.

The organisation of the code is heavily inspired from the [OpenZeppelin](https://openzeppelin.com/) contracts packages. We built modular extensions [extending contracts](https://docs.openzeppelin.com/contracts/3.x/extending-contracts) and presets. (see the [ERC20 approach](https://docs.openzeppelin.com/contracts/3.x/erc20)).

Extensions are for developers to choose what additional features or restrictions should be applied to their SDaoRegistrar.

A list of presets is also available. They are pre-configured contracts, ready to be deployed. Each of them uses a different set of extensions.

The code of this repository resolves around ENS, it is advised to be familiar with [Ethereum Name Service](https://ens.domains/) notions.

## Core contract: SDaoRegistrar (FCFS)

The contract allows first-come first-served (FCFS) registration of a subdomain, e.g. `label.domain.eth` through the `register`  method. 
The ownership of the subdomain is given to the registrant. The newly created subdomain resolves to the registrant.

```solidity
function register(string memory label)
    public
    virtual
    override
    onlyUnrestricted
  {
    _register(_msgSender(), label);
  }
```

The internal registration method `_register` is exposed internally for extensions of the `SDaoRegistrar`. Two hooks can be used: `_beforeRegistration` and `_afterRegistration`

```solidity
function _register(address account, string memory label) internal {
    bytes32 labelHash = keccak256(bytes(label));
    _beforeRegistration(account, labelHash);
    // [...]: subdomain created, subdomain resolves towards accounts, subdomain owner is account
    _afterRegistration(account, labelHash);
  }
```

### Constructor

```solidity
constructor(
    ENS ensAddr, // ENS Registry
    PublicResolver resolver, // Resolver to be used
    bytes32 node,    // nameHash('domain.eth')
    address owner    // owner of the registrar
  )
```

The node corresponds to the [namehash](https://docs.ens.domains/contract-api-reference/name-processing) of the domain of the SDAO, e.g. `domain.eth`.

### Interface and Implementation

See `contracts/sdao/ISDaoRegistrar.sol` and `contracts/sdao/SDaoRegistrar.sol` for the exact interface and implementation.

## Extensions

An extension is an abstract contract which inherits the `SDaoRegistrar` core contract.

It may add other public methods for registration using the internal registration method or/and implements the `beforeRegistration` and `afterRegistration` hooks.

extensions are easy to read: `/contracts/sdao/extensions/*.sol`

### SDaoRegistrarReserved Extension

```solidity
function _beforeRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override
  {
    super._beforeRegistration(account, labelHash);

    if (block.timestamp - DAO_BIRTH_DATE <= _reservationDuration) {
      address dotEthSubdomainOwner = ENS_REGISTRY.owner(
        keccak256(abi.encodePacked(ETH_NODE, labelHash))
      );
      require(
        dotEthSubdomainOwner == address(0x0) ||
          dotEthSubdomainOwner == _msgSender(),
        'SDAO_REGISTRAR_RESERVED: SUBDOMAIN_RESERVED'
      );
    }
  }
  ```

A reservation period is introduced during which registration of a subdomain `subdomain.domain.eth` is blocked if the related `subdomain.eth` is owned by someone else than the registrant. The reservation period can be updated by the owner of the contract.

See `contracts/sdao/extensions/SDaoRegistrarReserved.sol` for the implementation.

### SDaoRegistrarLimited Extension

```solidity
function _beforeRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override
  {
    super._beforeRegistration(account, labelHash);

    require(
      _counter < _registrationLimit,
      'SDAO_REGISTRAR_LIMITED: REGISTRATION_LIMIT_REACHED'
    );
  }
```
```solidity
function _afterRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override
  {
    super._afterRegistration(account, labelHash);

    _counter += 1;
  }
```

A counter for the number of registered subdomains and a registration limit number are added. If the counter reaches the registration limit, registration is blocked. The registration limit can be updated by the owner of the contract.

See `contracts/sdao/extensions/SDaoRegistrarLimited.sol` for the implementation.

### SDaoRegistrarERC721Generator Extension
```solidity
function _afterRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override
  {
    super._afterRegistration(account, labelHash);

    bytes32 childNode = keccak256(abi.encodePacked(ROOT_NODE, labelHash));
    ERC721_TOKEN.mintTo(account, uint256(childNode));
  }
  ```
  An ERC721 is minted and the registration is blocked if the balance of the registrant is not zero.
  See `contracts/sdao/extensions/SDaoRegistrarERC721Generator.sol` for the implementation.
### SDaoRegistrarERC1155Generator Extension
```solidity
function _afterRegistration(address account, bytes32 labelHash)
    internal
    virtual
    override
  {
    super._afterRegistration(account, labelHash);

    (uint256 id, bytes memory data) = _getToken(account, labelHash);

    ERC1155_MINTER.mint(account, id, 1, data);
  }
```

An ERC1155 token is minted for the registrant after each registration. The ERC1155 token ID and data are left free to be implemented by the developer.
The registration is blocked if the balance of the registrant is not zero, based on a `balanceOf` method to be implemented by the developer.
See `contracts/sdao/extensions/SDaoRegistrarERC1155Generator.sol` for the implementation.


### SDaoRegistrarCodeAccessible Extension
```solidity
function registerWithAccessCode(
    string memory label,
    address recipient,
    bytes memory accessCode
  ) external override {
    // [...]
    require(
      !_consumed[digest],
      'SDAO_REGISTRAR_LIMITED_CODE_ACCESSIBLE: ACCESS_CODE_ALREADY_CONSUMED'
    );

    require(
      digest.recover(accessCode) == _codeSigner,
      'SDAO_REGISTRAR_LIMITED_CODE_ACCESSIBLE: INVALID_ACCESS_CODE OR INVALID_SENDER'
    );
    // [...]
  }
```

A new public method of registration `registerWithAccessCode` is added. It allows to register a subdomain if a valid access code is given.

An access code is a signed message according to the [EIP712](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md) specification. The message contains domain specific information set at the deployment of the contract and the data of the message. The data contains the recipient address, which will receive the subdomain, and a number called `group ID`.

The message must be signed by a specific `code signer` address in order to be valid. The `code signer` value is managed by the owner of the contract. The `group ID` is retrieved using an internal method that needs to be implemented in the final contract.

An access code can only be consumed once.

See `contracts/sdao/extensions/SDaoRegistrarCodeAccessible.sol` for the implementation.

### SDaoRegistrarClaimable Extension

```solidity
function claim(string memory label, address account) public override {
    bytes32 labelHash = keccak256(bytes(label));
    address bookingAddress = ENS_LABEL_BOOKER.getBooking(labelHash);
    require(
      bookingAddress != address(0),
      'SDAO_REGISTRAR_CLAIMABLE: LABEL_NOT_BOOKED'
    );
    require(
      bookingAddress == _msgSender() || owner() == _msgSender(),
      'SDAO_REGISTRAR_CLAIMABLE: SENDER_NOT_ALLOWED'
    );

    _register(account, label);

    ENS_LABEL_BOOKER.deleteBooking(labelHash);
  }
```

An address of an ENS Label Booker is added. The latter manages a mapping of booking formed by a link between a subdomain and a booking address.

A new public method of registration `claim` is added. It allows to register a subdomain if the sender of the message is the booking address associated to the subdomain.

The FCFS served registration is blocked if the subdomain is already booked.

See `contracts/sdao/extensions/SDaoRegistrarClaimable.sol` and `contracts/ens-label-booker/ENSLabelBooker.sol` for the implementation of the extension and the Label Booker contracts.

## Presets

A preset is an SDAO Registrar contract extended with a set of extensions. It may be considered as ready to use contracts or examples of the extensions usage.

- Limited Reserved ERC1155 Preset 
  - hardhat task `deploy-sdao-preset-erc1155`)
  - implements `SDaoRegistrarLimited`, `SDaoRegistrarReserved` and `SDaoRegistrarERC1155Generator` extensions.
- Limited Reserved ERC721 Preset
  - hardhat task: `deploy-sdao-preset-erc721`
  - implements `SDaoRegistrarLimited`, `SDaoRegistrarReserved` and `SDaoRegistrarERC721Generator` extensions.
- Code Accessible Preset
  - hardhat task: `deploy-sdao-preset-code-accessible`
  - implements `SDaoRegistrarCodeAccessible` extension
- Claimable Preset
  - hardhat task: `deploy-sdao-preset-claimable`
  - implements `SDaoRegistrarClaimable` extension

See `contracts/sdao/presets/*.sol` for the implementations.

## Hardhat scripts

**Note:** Most of the scripts are used for development purposes. Deployment scripts for the various presets are available but it is strongly advised to understand them before using them.

#### `deploy-ens-full`

```ts
const deployedENS: DeployedEns = await HRE.run('deploy-ens-full', {sDao: true, log: true});
// with 
export type DeployedEns = {
  ensDeployer: ENSDeployer;
  registry: ENSRegistry;
  registrar: EthRegistrar;
  reverseRegistrar: ReverseRegistrar;
  publicResolver: PublicResolver;
};
```

Deploys a suite of ENS contracts. The deployed .eth Registrar is simplified in order to allow direct registration instead of the usual two steps registration process.

The boolean flag `sDao` allows to additionally deploy a SDAO Registrar.

See `tasks/deploy-ens-full.ts` for the script and the full list of parameters.

#### `deploy-label-booker`

Deploys a Label Booker contract.

The `name` of the targeted domain is given as parameter, i.e. `<name>.eth`.

See `tasks/deploy-label-booker.ts` for the script and the full list of parameters.


## Development

### NPM scripts
#### `npm install`

Install the dependencies.

#### `npm compile`

Compile the smart contracts and generate the associated TypeScript types.

#### `npm test`

Launch all the tests.

Individual scripts are available for each test suite.

The `contracts/test-utils` repository contains various helpful contracts for the tests, in particular the `ENSDeployer` that can be used in order to redeploy a suite of ENS contracts with a modified Registrar.

## License

The code of this repository is released under the [MIT License](LICENSE).
