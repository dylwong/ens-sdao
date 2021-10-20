import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployer, logHre } from '../helpers';
import {
  ENSDeployer__factory,
  ENSRegistry__factory,
  EthRegistrar__factory,
  ReverseRegistrar__factory,
  PublicResolver__factory,
  NameWrapper__factory,
  ENSDaoToken,
  ENSDaoRegistrar,
  ENSLabelBooker,
} from '../../types';

type DeployEnsFull = {
  // additionally deploy ENS DAO contracts
  ensDao?: boolean;
  // enabling logging
  log?: boolean;
};

async function deploiementAction(
  { ensDao, log }: DeployEnsFull,
  hre: HardhatRuntimeEnvironment
) {
  if (log) await logHre(hre);

  const deployer = await getDeployer(hre, log);

  const newEnsDeployer = await hre.deployments.deploy('ENSDeployer', {
    from: deployer.address,
    args: [],
  });

  const ensDeployer = ENSDeployer__factory.connect(
    newEnsDeployer.address,
    deployer
  );
  const registry = ENSRegistry__factory.connect(
    await ensDeployer.ens(),
    deployer
  );
  const registrar = EthRegistrar__factory.connect(
    await ensDeployer.ethRegistrar(),
    deployer
  );
  const reverseRegistrar = ReverseRegistrar__factory.connect(
    await ensDeployer.reverseRegistrar(),
    deployer
  );
  const publicResolver = PublicResolver__factory.connect(
    await ensDeployer.publicResolver(),
    deployer
  );
  const nameWrapper = NameWrapper__factory.connect(
    await ensDeployer.nameWrapper(),
    deployer
  );

  console.log(
    `Deployed by ${deployer.address}.
      ensDeployer: ${ensDeployer.address}
      registry: ${registry.address}
      registrar: ${registrar.address}
      reverseRegistrar: ${reverseRegistrar.address}
      publicResolver: ${publicResolver.address}
      nameWrapper: ${nameWrapper.address}
      `
  );

  if (!ensDao)
    return {
      ensDeployer,
      registry,
      registrar,
      reverseRegistrar,
      publicResolver,
      nameWrapper,
    };

  const {
    ensDaoRegistrar,
    ensDaoToken,
    ensDaoLabelBooker,
  }: {
    ensDaoRegistrar: ENSDaoRegistrar;
    ensDaoToken: ENSDaoToken;
    ensDaoLabelBooker: ENSLabelBooker;
  } = await hre.run('deploy-ens-dao', {
    name: 'sismo',
    symbol: 'SISMO',
    ens: registry.address,
    resolver: publicResolver.address,
    nameWrapper: nameWrapper.address,
    log,
  });

  return {
    ensDeployer,
    registry,
    registrar,
    reverseRegistrar,
    publicResolver,
    nameWrapper,
    ensDaoRegistrar,
    ensDaoToken,
    ensDaoLabelBooker,
  };
}

task('deploy-ens-full')
  .addFlag('ensDao', 'deploy ens-dao')
  .addFlag('log', 'logging deployments')
  .setAction(deploiementAction);
