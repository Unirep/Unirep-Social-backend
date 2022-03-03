import ErrorHandler from '../ErrorHandler';
import { UserTransitionProof } from '@unirep/contracts';

import { DEPLOYER_PRIV_KEY, UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER, } from '../constants';
import { verifyUSTProof } from './utils';
import { getCurrentEpoch } from '../database/utils';
import { UnirepSocialContract } from '@unirep/unirep-social';

class USTController {
    private contract = new UnirepSocialContract(UNIREP_SOCIAL, DEFAULT_ETH_PROVIDER)

    defaultMethod() {
        throw new ErrorHandler(501, 'API: Not implemented method');
    }

    submitStartTransitionProof = async (startTransitionProof: any)=> {
        try {
            const tx = await this.contract.submitStartTransitionProof(
                startTransitionProof
            )
            await tx.wait()
            return { tx }
        } catch (error) {
            console.log("Try a new nonce");
            if (JSON.stringify(error).includes('replacement fee too low')) {
                return await this.submitStartTransitionProof(startTransitionProof);
            }
            return { error }
        }
    }

    submitProcessAttestationsProof = async (processAttestationProof: any) => {
        try {
            const tx = await this.contract.submitProcessAttestationsProof(
                processAttestationProof
            )
            await tx.wait()
            return { tx }
        } catch (error) {
            console.log("Try a new nonce");
            if (JSON.stringify(error).includes('replacement fee too low')) {
                return await this.submitProcessAttestationsProof(processAttestationProof);
            }
            return { error }
        }
    }

    submitUserStateTransitionProof = async (finalTransitionProof: any, proofIndexes: BigInt[]) => {
        try {
            const tx = await this.contract.submitUserStateTransitionProof(
                finalTransitionProof,
                proofIndexes
            )
            await tx.wait()
            return { tx }
        } catch (error) {
            console.log("Try a new nonce");
            if (JSON.stringify(error).includes('replacement fee too low')) {
                return await this.submitUserStateTransitionProof(finalTransitionProof, proofIndexes)
            }
            return { error }
        }
    }

    userStateTransition = async (data: any) => {
        await this.contract.unlock(DEPLOYER_PRIV_KEY);
        const currentEpoch = await getCurrentEpoch()
        const results = data.results;

        const error = await verifyUSTProof(results, currentEpoch)
        if(error !== undefined) return {error, transactionHash: undefined}

        // submit user state transition proofs
        const proofIndexes: BigInt[] = []
        let res = await this.submitStartTransitionProof(results.startTransitionProof);
        if (res.error !== undefined) {
            return { error: res.error }
        }

        for (let i = 0; i < results.processAttestationProofs.length; i++) {
            res = await this.submitProcessAttestationsProof(results.processAttestationProofs[i])
            if (res.error !== undefined) {
                return { error: res.error }
            }    
        }
        const proofIndex = await this.contract.getStartTransitionProofIndex(
            results.startTransitionProof
        )
        proofIndexes.push(BigInt(proofIndex))
        for (let i = 0; i < results.processAttestationProofs.length; i++) {
            const proofIndex = await this.contract.getProcessAttestationsProofIndex(
                results.processAttestationProofs[i]
            )
            proofIndexes.push(BigInt(proofIndex))
        }
        const USTProof = new UserTransitionProof(
            results.finalTransitionProof.publicSignals,
            results.finalTransitionProof.proof
        )
        res = await this.submitUserStateTransitionProof(USTProof, proofIndexes)
        if (res.error !== undefined) {
            return { error: res.error }
        }

        return {transaction: res?.tx?.hash}
    }
}

export = new USTController();
