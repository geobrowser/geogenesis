import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.ethers.getSigners();

  console.log(
    `Using account "${
      deployer.address
    }" with a balance of ${hre.ethers.utils.formatEther(
      await deployer.getBalance()
    )} for deployment...`
  );
};

export default func;
func.tags = ['Info', 'Deployment'];
