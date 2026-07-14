type Participant = {
  id: string;
  roomId: string;
  userId: string;
  status: "active" | "left" | "removed";
};
type Source = {
  id: string;
  roomId: string;
  participantId: string;
  senderUserId: string;
  messageType: "user" | "system" | "trailie";
  deletedAt: string | null;
};

export function authorizeTrailieSource(input: {
  authUserId: string;
  roomId: string;
  participant: Participant | null;
  source: Source | null;
}) {
  const { authUserId, roomId, participant, source } = input;
  return Boolean(
    participant &&
    source &&
    participant.status === "active" &&
    participant.roomId === roomId &&
    participant.userId === authUserId &&
    source.roomId === roomId &&
    source.participantId === participant.id &&
    source.senderUserId === authUserId &&
    source.messageType === "user" &&
    source.deletedAt === null,
  );
}
