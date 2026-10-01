import {notFound} from 'next/navigation';
import {ClubRelationships} from '@/components/cec/ClubPortal';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(slug!=='cec')notFound();return <ClubRelationships/>;}
