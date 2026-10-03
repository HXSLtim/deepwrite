<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { onBeforeUnmount, ref, watch } from "vue";
import {
  provideConversationDisclosureScope,
  useConversationDisclosureScopeClear
} from "../composables/conversationDisclosureState";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";
import { formatFileSize } from "../composables/useConversationAttachments";
import type {
  ChatMessage,
  ConversationMessageRewriteRequest
} from "../types/conversation";
import { uiMessage } from "../ui-feedback";
import {
  actionableApprovalItems,
  approvalItemsForMessage,
  hasProcessing,
  visibleResponse
} from "./conversationToolPresentation";
import AgentEditProposalCard from "./AgentEditProposalCard.vue";
import AppIcon from "./AppIcon.vue";
import ConversationProcessingTimeline from "./ConversationProcessingTimeline.vue";
import ConversationUserMessageEditor from "./ConversationUserMessageEditor.vue";
import LongProposalReview from "./LongProposalReview.vue";
import StreamedContent from "./StreamedContent.vue";

const t = createScopedTranslator("components.conversationMessageItem");

const props = withDefaults(
  defineProps<{
    message: ChatMessage;
    allowLiveEditReview?: boolean;
    editable?: boolean;
    editing?: boolean;
    submitEditedMessage?:
      | ((request: ConversationMessageRewriteRequest) => Promise<boolean>)
      | undefined;
    longProposalItems?: readonly LongWorkspaceProposalItem[];
    longWorkspaceIndex?: LongWorkspaceIndexSnapshot | null;
  }>(),
  {
    allowLiveEditReview: false,
    editable: false,
    editing: false,
    longProposalItems: () => [],
    longWorkspaceIndex: null
  }
);

const emit = defineEmits<{
  reviewEdit: [
    payload: {
      runId: string;
      proposalId: string;
      decision: "accept" | "reject";
    }
  ];
  locateEditProposal: [payload: { runId: string; proposalId: string }];
  discardEditProposal: [payload: { runId: string; proposalId: string }];
  approveLongProposal: [eventId: string];
  rejectLongProposal: [eventId: string];
  retryLongProposalPreview: [eventId: string];
  locateLongProposal: [eventId: string];
  requestEdit: [messageId: string];
  cancelEdit: [messageId: string];
}>();

provideConversationDisclosureScope(() => props.message.id);

const clearMessageDisclosureScope = useConversationDisclosureScopeClear(
  () => props.message.id
);

watch(
  () => props.message.status === "streaming",
  (streaming, was) => {
    if (was && !streaming) {
      clearMessageDisclosureScope();
    }
  }
);
const copied = ref(false);
let copiedTimer: number | undefined;

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleTimeString(locale.value, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function requestEdit(): void {
  if (props.editable && !props.editing) emit("requestEdit", props.message.id);
}

async function copyMessage(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.message.content);
    copied.value = true;
    if (copiedTimer !== undefined) globalThis.clearTimeout(copiedTimer);
    copiedTimer = globalThis.setTimeout(() => {
      copied.value = false;
    }, 1_500);
    uiMessage.success(
      props.message.role === "assistant" ? t("replyCopied") : t("messageCopied")
    );
  } catch {
    uiMessage.error(t("copyFailedTryAgainLater"));
  }
}

onBeforeUnmount(() => {
  if (copiedTimer !== undefined) globalThis.clearTimeout(copiedTimer);
});

function acceptAllApprovals(message: ChatMessage): void {
  for (const approval of actionableApprovalItems(
    message,
    props.longProposalItems
  )) {
    if (approval.type === "edit-proposal") {
      emit("reviewEdit", {
        runId: approval.proposal.runId,
        proposalId: approval.proposal.id,
        decision: "accept"
      });
    } else {
      emit("approveLongProposal", approval.item.event.id);
    }
  }
}

function rejectAllApprovals(message: ChatMessage): void {
  for (const approval of actionableApprovalItems(
    message,
    props.longProposalItems
  )) {
    if (approval.type === "edit-proposal") {
      emit("reviewEdit", {
        runId: approval.proposal.runId,
        proposalId: approval.proposal.id,
        decision: "reject"
      });
    } else {
      emit("rejectLongProposal", approval.item.event.id);
    }
  }
}
</script>

<template>
  <article
    :data-conversation-message-id="message.id"
    class="message"
    :class="[
      `is-${message.role}`,
      {
        'is-editing': editing,
        'is-empty-error':
          message.role === 'assistant' &&
          message.status === 'error' &&
          !message.content &&
          !hasProcessing(message) &&
          !message.subagentRuns?.length &&
          !message.editProposals?.length
      }
    ]"
  >
    <div class="message-body">
      <ConversationProcessingTimeline
        v-if="message.role === 'assistant'"
        :message="message"
        :allow-live-edit-review="allowLiveEditReview"
        :long-proposal-items="longProposalItems"
        :long-workspace-index="longWorkspaceIndex"
        @review-edit="emit('reviewEdit', $event)"
        @locate-edit-proposal="emit('locateEditProposal', $event)"
        @discard-edit-proposal="emit('discardEditProposal', $event)"
        @approve-long-proposal="emit('approveLongProposal', $event)"
        @reject-long-proposal="emit('rejectLongProposal', $event)"
        @retry-long-proposal-preview="emit('retryLongProposalPreview', $event)"
        @locate-long-proposal="emit('locateLongProposal', $event)"
      />
      <div class="message-content">
        <ConversationUserMessageEditor
          v-if="message.role === 'user' && editing && submitEditedMessage"
          :message-id="message.id"
          :initial-content="message.content"
          :disabled="!editable"
          :submit-edited-message="submitEditedMessage"
          @cancel="emit('cancelEdit', message.id)"
        />
        <div
          v-else-if="message.role === 'user'"
          class="message-copy user-message-copy"
          @dblclick="requestEdit"
        >
          <div
            v-if="message.attachments?.length"
            class="message-attachment-list"
            :aria-label="t('messageAttachments')"
          >
            <span
              v-for="attachment in message.attachments"
              :key="attachment.id"
              class="message-attachment-chip"
              :title="`${attachment.name} · ${formatFileSize(attachment.size)}`"
            >
              <AppIcon
                :name="attachment.kind === 'image' ? 'image' : 'file'"
                :size="14"
              />
              <span>{{ attachment.name }}</span>
              <small v-if="attachment.truncated">{{ t("truncated") }}</small>
            </span>
          </div>
          {{ message.content }}
        </div>
        <div
          v-else-if="visibleResponse(message)"
          class="message-copy"
          :class="{ 'is-streaming': message.status === 'streaming' }"
          :data-assistant-response-message-id="
            message.status === 'streaming' ? undefined : message.id
          "
        >
          <StreamedContent
            :content="visibleResponse(message)"
            format="markdown"
            :streaming="message.status === 'streaming'"
          />
        </div>
        <div v-if="message.status === 'stopped'" class="message-stopped-copy">
          {{ t("generationStopped") }}
        </div>
        <section
          v-if="
            message.role === 'assistant' &&
            message.status !== 'streaming' &&
            approvalItemsForMessage(message, longProposalItems).length
          "
          class="approval-card-stack"
          :aria-label="t('approvalCardsForThisTurn')"
        >
          <div
            v-if="
              actionableApprovalItems(message, longProposalItems).length > 1
            "
            class="approval-stack-batch"
          >
            <button
              type="button"
              class="edit-review-button is-accept"
              @click="acceptAllApprovals(message)"
            >
              {{ t("acceptAllApprovals") }}
            </button>
            <button
              type="button"
              class="edit-review-button is-reject"
              @click="rejectAllApprovals(message)"
            >
              {{ t("rejectAllApprovals") }}
            </button>
          </div>
          <template
            v-for="approval in approvalItemsForMessage(
              message,
              longProposalItems
            )"
            :key="approval.id"
          >
            <AgentEditProposalCard
              v-if="approval.type === 'edit-proposal'"
              :proposal="approval.proposal"
              :message-status="message.status"
              :allow-live-edit-review="allowLiveEditReview"
              :discardable="approval.canDiscard"
              @review="emit('reviewEdit', $event)"
              @locate="emit('locateEditProposal', $event)"
              @discard="emit('discardEditProposal', $event)"
            />
            <LongProposalReview
              v-else
              embedded
              conversation-card
              :items="[approval.item]"
              :workspace-index="longWorkspaceIndex"
              @approve="emit('approveLongProposal', $event)"
              @reject="emit('rejectLongProposal', $event)"
              @retry-preview="emit('retryLongProposalPreview', $event)"
              @locate="emit('locateLongProposal', $event)"
            />
          </template>
        </section>
      </div>

      <div
        v-if="message.content && message.status !== 'streaming' && !editing"
        class="message-actions"
      >
        <span v-if="message.role === 'user'">{{
          formatTime(message.createdAt)
        }}</span>
        <button
          v-if="message.role === 'user' && editable"
          type="button"
          :aria-label="t('editAndResend')"
          @click="requestEdit"
        >
          <AppIcon name="edit" :size="15" />
        </button>
        <button
          type="button"
          :aria-label="
            copied
              ? t('copied')
              : message.role === 'assistant'
                ? t('copyReply')
                : t('copyMessage')
          "
          @click="copyMessage"
        >
          <AppIcon :name="copied ? 'check' : 'copy'" :size="15" />
        </button>
        <span v-if="message.role === 'assistant'">{{
          formatTime(message.createdAt)
        }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.message.is-user.is-editing .message-body {
  width: 100%;
  max-width: 100%;
}

.message.is-user.is-editing .message-content {
  width: 100%;
  padding: 0;
  background: transparent;
}
</style>
